// apps/web/convex/agreements.test.ts
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi, describe } from "vitest";

import { api, internal } from "./_generated/api";
import { drawSignedPdf } from "./agreements/pdf.ts";
import schema from "./schema.ts";

// The PAdES seal needs real key material + Node crypto, neither of which belong
// in these wiring tests — sealing itself is covered by seal.test.ts. Stub the
// three seal exports signAgreement uses so it exercises the storage/record/email
// flow with a pass-through "sealed" PDF.
vi.mock("./agreements/seal.ts", () => ({
	sealPdf: vi.fn((bytes: Uint8Array) => Promise.resolve(bytes)),
	sha256Hex: vi.fn(() => "test-signed-pdf-hash"),
	signingCertFingerprint: vi.fn(() => "test-cert-fingerprint"),
}));

// Pass-through spy: real drawing for existing tests, call args inspectable.
vi.mock("./agreements/pdf.ts", async (orig) => {
	const real = await orig<typeof import("./agreements/pdf.ts")>();
	return { ...real, drawSignedPdf: vi.fn(real.drawSignedPdf) };
});

const BOARD_SIGNATORIES_FIXTURE = JSON.stringify([
	{
		name: "Hopper, Grace",
		role: "President of the board",
		signatureSlug: "hopper-grace",
	},
	{
		name: "Turing, Alan",
		role: "Vice-president of the board",
		signatureSlug: "turing-alan",
	},
]);

beforeEach(() => {
	vi.stubEnv("BOARD_SIGNATORIES", BOARD_SIGNATORIES_FIXTURE);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

const modules = import.meta.glob("./**/*.*s");
const PNG_1PX =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function approvedMember(t: ReturnType<typeof convexTest>) {
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "onboarding",
			stageSince: Date.now(),
			venture: { name: "Engine Co" },
		})
	);
}

describe("signAgreement", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RESEND_API_KEY;
	});

	it("records a signature, stores a PDF, and completes the document step", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const sig = await t.run((ctx) => ctx.db.query("signatures").first());
		expect(sig?.signedName).toBe("Ada Lovelace");
		expect(sig?.variant).toBe("member");
		expect(sig?.fileId).toBeDefined();
		const person = await t.run((ctx) =>
			ctx.db
				.query("people")
				.withIndex("by_email", (q) => q.eq("email", "ada@example.com"))
				.unique()
		);
		const docStep = (
			person?.onboarding?.steps as
				| Record<string, { completedAt: number } | undefined>
				| undefined
		)?.document;
		expect(docStep?.completedAt).toBeTypeOf("number");
	});

	it("uses the server-derived name, ignoring any client value", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await t.run((ctx) => ctx.db.query("signatures").first());
		expect(sig?.signedName).toBe("Ada Lovelace");
	});

	it("rejects a second signing (one signature per person)", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		await expect(
			t
				.withIdentity({ email: "ada@example.com" })
				.action(api.agreements.signAgreement, { signaturePng: PNG_1PX })
		).rejects.toThrow(/already signed/i);
		const sigs = await t.run((ctx) => ctx.db.query("signatures").collect());
		expect(sigs).toHaveLength(1);
	});
});

describe("previewAgreement", () => {
	it("returns a filled, unsigned PDF for an approved member", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		const b64 = await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.previewAgreement, {});
		expect(b64).toBeTypeOf("string");
		const bytes = Buffer.from(b64!, "base64");
		expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("returns null when the user is not in onboarding", async () => {
		const t = convexTest(schema, modules);
		const b64 = await t.action(api.agreements.previewAgreement, {});
		expect(b64).toBeNull();
	});
});

describe("signingContext for people with no applications row", () => {
	it("lets a person created after the cutover (no applicationId, no legacy type gate) fetch a signing context and sign", async () => {
		// This is the regression Task 20 exists to fix: signingContext used to
		// gate on person.applicationId + person.type ∈ {member, guest}, both of
		// which are meaningless for a person the machine (not the applications
		// table) created. There is no `applicationId` field set here at all.
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "post-cutover@example.com",
				firstName: "Post",
				lastName: "Cutover",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				venture: { name: "New Co" },
			})
		);
		const ctxData = await t
			.withIdentity({ email: "post-cutover@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(ctxData).toMatchObject({
			email: "post-cutover@example.com",
			variant: "member",
			company: "New Co",
			alreadySigned: false,
		});

		await t
			.withIdentity({ email: "post-cutover@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await t.run((ctx) => ctx.db.query("signatures").first());
		expect(sig?.variant).toBe("member");
		// The bug this task fixes was framed as "every agreement comes out with
		// a blank company" — the assertion belongs on the written agreement
		// (the signatures row), not only on the context that feeds it.
		expect(sig?.company).toBe("New Co");
	});

	it("lets an imported person (provenance notion, no applicationId) fetch a signing context and sign", async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "imported@example.com",
				firstName: "Imported",
				lastName: "Person",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				provenance: "notion",
				venture: { name: "Import Co" },
			})
		);
		const ctxData = await t
			.withIdentity({ email: "imported@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(ctxData).toMatchObject({
			email: "imported@example.com",
			variant: "guest",
			alreadySigned: false,
		});

		await t
			.withIdentity({ email: "imported@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await t.run((ctx) => ctx.db.query("signatures").first());
		expect(sig?.variant).toBe("guest");
	});
});

describe("signingContext requires an entitled person", () => {
	const ONE_DAY = 24 * 60 * 60 * 1000;

	async function onboardingMember(
		access: { accessFrom?: number; accessUntil?: number },
		email: string
	) {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				...access,
			})
		);
		return t.withIdentity({ email });
	}

	it("returns null once the access window has ended", async () => {
		const t = await onboardingMember(
			{ accessUntil: Date.now() - ONE_DAY },
			"ended@example.com"
		);
		expect(
			await t.query(internal.agreementsInternal.signingContext, {})
		).toBeNull();
	});

	it("returns null before the access window has started", async () => {
		const t = await onboardingMember(
			{ accessFrom: Date.now() + ONE_DAY },
			"future@example.com"
		);
		expect(
			await t.query(internal.agreementsInternal.signingContext, {})
		).toBeNull();
	});

	it("still returns the context inside the access window", async () => {
		const t = await onboardingMember(
			{
				accessFrom: Date.now() - ONE_DAY,
				accessUntil: Date.now() + ONE_DAY,
			},
			"inside@example.com"
		);
		expect(
			await t.query(internal.agreementsInternal.signingContext, {})
		).toMatchObject({ email: "inside@example.com", variant: "member" });
	});
});

describe("signingContext after a promotion", () => {
	it("does not report a promoted guest as already signed — the variant changed", async () => {
		// The exact failure the spec exists to fix: a guest promoted to member
		// holds only a guest agreement, so the member agreement must still be
		// offered. Keying `alreadySigned` off "any signature exists" locked them
		// out of ever becoming compliant.
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				venture: { name: "Guest Co" },
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "gia@example.com",
				variant: "guest",
				signedName: "Gia Guest",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		const ctxData = await t
			.withIdentity({ email: "gia@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(ctxData).toMatchObject({
			personId: id,
			variant: "member",
			company: "Guest Co",
			alreadySigned: false,
		});
	});

	it("recording a signature completes the document step and can activate", async () => {
		const t = convexTest(schema, modules);
		// A REAL storage id. `convex-test` validates `v.id("_storage")` through
		// `tableNameFromId` (dist/index.js:540-546), which requires a leading
		// `/^[0-9]+/` followed by the table name — its own fake ids are
		// `padStart(32 - tableName.length, "0") + tableName`. A literal like
		// `"kg2000000000000000000000000000" as never` fails args validation
		// (`:1666`) and again at `ctx.db.insert` (`:231-239`).
		const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			})
		);

		await t.mutation(internal.agreementsInternal.recordSignature, {
			personId: id,
			email: "ada@example.com",
			variant: "member",
			signedName: "Ada Lovelace",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.onboarding?.steps.document).toBeDefined();
		expect(person?.stage).toBe("active");
	});
});

describe("legacy (drive-url) agreements do not block in-app signing", () => {
	it("a legacy sourceUrl signature of the current variant is not 'already signed'", async () => {
		// The reported bug: an imported member with only a Google Drive
		// `sourceUrl` agreement hit "Agreement already signed." on the
		// onboarding signature screen.
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "leg@example.com",
				firstName: "Leg",
				lastName: "Acy",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "leg@example.com",
				variant: "member",
				signedName: "Leg Acy",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				sourceUrl: "https://example.com/legacy.pdf",
			});
		});

		const ctxData = await t
			.withIdentity({ email: "leg@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(ctxData).toMatchObject({
			variant: "member",
			alreadySigned: false,
		});
	});

	it("a native (fileId) signature of the current variant IS already signed", async () => {
		const t = convexTest(schema, modules);
		const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
		await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "nat@example.com",
				firstName: "Nat",
				lastName: "Ive",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "nat@example.com",
				variant: "member",
				signedName: "Nat Ive",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				fileId,
			});
		});

		const ctxData = await t
			.withIdentity({ email: "nat@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(ctxData).toMatchObject({
			variant: "member",
			alreadySigned: true,
		});
	});

	it("recordSignature crushes the legacy same-variant row and leaves other variants", async () => {
		const t = convexTest(schema, modules);
		const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
		const personId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("people", {
				email: "crush@example.com",
				firstName: "Cru",
				lastName: "Sh",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			// Legacy member row (must be crushed) + a legacy row of a DIFFERENT
			// variant (must survive — only the signed variant is replaced).
			await ctx.db.insert("signatures", {
				personId: id,
				email: "crush@example.com",
				variant: "member",
				signedName: "Cru Sh",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				sourceUrl: "https://example.com/legacy-member.pdf",
			});
			await ctx.db.insert("signatures", {
				personId: id,
				email: "crush@example.com",
				variant: "guest",
				signedName: "Cru Sh",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				sourceUrl: "https://example.com/legacy-guest.pdf",
			});
			return id;
		});

		await t.mutation(internal.agreementsInternal.recordSignature, {
			personId,
			email: "crush@example.com",
			variant: "member",
			signedName: "Cru Sh",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});

		const sigs = await t.run(async (ctx) =>
			ctx.db
				.query("signatures")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		const member = sigs.filter((s) => s.variant === "member");
		const guest = sigs.filter((s) => s.variant === "guest");
		// Exactly one member row now, and it is the native one (has fileId, no
		// leftover legacy sourceUrl).
		expect(member).toHaveLength(1);
		expect(member[0].fileId).toBeDefined();
		expect(member[0].sourceUrl).toBeUndefined();
		// The different-variant legacy row is untouched.
		expect(guest).toHaveLength(1);
		expect(guest[0].sourceUrl).toBeDefined();
	});
});

describe("board signatures", () => {
	const BOARD_PNG =
		"data:image/png;base64," +
		Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
		]).toString("base64");

	it("setBoardSignature stores the PNG once per slug", async () => {
		const t = convexTest(schema, modules);
		await t.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		await t.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		const rows = await t.run((ctx) =>
			ctx.db.query("boardSignatures").collect()
		);
		expect(rows).toHaveLength(1);
		expect(
			await t.run((ctx) => ctx.storage.getUrl(rows[0].fileId))
		).not.toBeNull();
	});

	it("rejects an unknown slug", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.action(internal.agreements.setBoardSignature, {
				slug: "nobody",
				dataUrl: BOARD_PNG,
			})
		).rejects.toThrow(/Unknown signatory slug/);
	});

	it("signAgreement stamps only the board members with an uploaded PNG", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		await t.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		// The stored board PNG is fake bytes; only the call args matter here.
		vi.mocked(drawSignedPdf)
			.mockClear()
			.mockImplementationOnce(() => Promise.resolve(new Uint8Array([1])));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const opts = vi.mocked(drawSignedPdf).mock.calls[0][1];
		expect(opts.board[0].signaturePng).toBeDefined();
		expect(opts.board[1].signaturePng).toBeUndefined();
	});

	it("signAgreement stamps the env signatories in order", async () => {
		const t = convexTest(schema, modules);
		await approvedMember(t);
		vi.mocked(drawSignedPdf)
			.mockClear()
			.mockImplementationOnce(() => Promise.resolve(new Uint8Array([1])));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await t
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const opts = vi.mocked(drawSignedPdf).mock.calls[0][1];
		expect(opts.board.map((b) => [b.name, b.role])).toEqual([
			["Hopper, Grace", "President of the board"],
			["Turing, Alan", "Vice-president of the board"],
		]);
	});

	it("signAgreement fails clearly when BOARD_SIGNATORIES is unset", async () => {
		vi.stubEnv("BOARD_SIGNATORIES", "");
		const t = convexTest(schema, modules);
		await approvedMember(t);
		await expect(
			t
				.withIdentity({ email: "ada@example.com" })
				.action(api.agreements.signAgreement, {
					signaturePng: PNG_1PX,
				})
		).rejects.toThrow(/BOARD_SIGNATORIES is not configured/);
	});
});
