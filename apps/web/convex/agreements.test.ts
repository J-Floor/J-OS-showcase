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

async function approvedMember(backend: ReturnType<typeof convexTest>) {
	await backend.run((context) =>
		context.db.insert("people", {
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
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const sig = await backend.run((context) =>
			context.db.query("signatures").first()
		);
		expect(sig?.signedName).toBe("Ada Lovelace");
		expect(sig?.variant).toBe("member");
		expect(sig?.fileId).toBeDefined();
		const person = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "ada@example.com")
				)
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
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await backend.run((context) =>
			context.db.query("signatures").first()
		);
		expect(sig?.signedName).toBe("Ada Lovelace");
	});

	it("rejects a second signing (one signature per person)", async () => {
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.action(api.agreements.signAgreement, { signaturePng: PNG_1PX })
		).rejects.toThrow(/already signed/i);
		const sigs = await backend.run((context) =>
			context.db.query("signatures").collect()
		);
		expect(sigs).toHaveLength(1);
	});
});

describe("previewAgreement", () => {
	it("returns a filled, unsigned PDF for an approved member", async () => {
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		const b64 = await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.previewAgreement, {});
		expect(b64).toBeTypeOf("string");
		const bytes = Buffer.from(b64!, "base64");
		expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("returns null when the user is not in onboarding", async () => {
		const backend = convexTest(schema, modules);
		const b64 = await backend.action(api.agreements.previewAgreement, {});
		expect(b64).toBeNull();
	});
});

describe("signingContext for people with no applications row", () => {
	it("lets a person created after the cutover (no applicationId, no legacy type gate) fetch a signing context and sign", async () => {
		// This is the regression Task 20 exists to fix: signingContext used to
		// gate on person.applicationId + person.type ∈ {member, guest}, both of
		// which are meaningless for a person the machine (not the applications
		// table) created. There is no `applicationId` field set here at all.
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "post-cutover@example.com",
				firstName: "Post",
				lastName: "Cutover",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				venture: { name: "New Co" },
			})
		);
		const contextData = await backend
			.withIdentity({ email: "post-cutover@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(contextData).toMatchObject({
			email: "post-cutover@example.com",
			variant: "member",
			company: "New Co",
			alreadySigned: false,
		});

		await backend
			.withIdentity({ email: "post-cutover@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await backend.run((context) =>
			context.db.query("signatures").first()
		);
		expect(sig?.variant).toBe("member");
		// The bug this task fixes was framed as "every agreement comes out with
		// a blank company" — the assertion belongs on the written agreement
		// (the signatures row), not only on the context that feeds it.
		expect(sig?.company).toBe("New Co");
	});

	it("lets an imported person (provenance notion, no applicationId) fetch a signing context and sign", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
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
		const contextData = await backend
			.withIdentity({ email: "imported@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(contextData).toMatchObject({
			email: "imported@example.com",
			variant: "guest",
			alreadySigned: false,
		});

		await backend
			.withIdentity({ email: "imported@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		const sig = await backend.run((context) =>
			context.db.query("signatures").first()
		);
		expect(sig?.variant).toBe("guest");
	});
});

async function onboardingMember(
	access: { accessFrom?: number; accessUntil?: number },
	email: string
) {
	const backend = convexTest(schema, modules);
	await backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "onboarding",
			stageSince: Date.now(),
			...access,
		})
	);
	return backend.withIdentity({ email });
}

describe("signingContext requires an entitled person", () => {
	const ONE_DAY = 24 * 60 * 60 * 1000;

	it("returns null once the access window has ended", async () => {
		const backend = await onboardingMember(
			{ accessUntil: Date.now() - ONE_DAY },
			"ended@example.com"
		);
		expect(
			await backend.query(internal.agreementsInternal.signingContext, {})
		).toBeNull();
	});

	it("returns null before the access window has started", async () => {
		const backend = await onboardingMember(
			{ accessFrom: Date.now() + ONE_DAY },
			"future@example.com"
		);
		expect(
			await backend.query(internal.agreementsInternal.signingContext, {})
		).toBeNull();
	});

	it("still returns the context inside the access window", async () => {
		const backend = await onboardingMember(
			{
				accessFrom: Date.now() - ONE_DAY,
				accessUntil: Date.now() + ONE_DAY,
			},
			"inside@example.com"
		);
		expect(
			await backend.query(internal.agreementsInternal.signingContext, {})
		).toMatchObject({ email: "inside@example.com", variant: "member" });
	});
});

describe("signingContext after a promotion", () => {
	it("does not report a promoted guest as already signed — the variant changed", async () => {
		// The exact failure the spec exists to fix: a guest promoted to member
		// holds only a guest agreement, so the member agreement must still be
		// offered. Keying `alreadySigned` off "any signature exists" locked them
		// out of ever becoming compliant.
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				venture: { name: "Guest Co" },
			});
			await context.db.insert("signatures", {
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

		const contextData = await backend
			.withIdentity({ email: "gia@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(contextData).toMatchObject({
			personId: id,
			variant: "member",
			company: "Guest Co",
			alreadySigned: false,
		});
	});

	it("recording a signature completes the document step and can activate", async () => {
		const backend = convexTest(schema, modules);
		// A REAL storage id. `convex-test` validates `v.id("_storage")` through
		// `tableNameFromId` (dist/index.js:540-546), which requires a leading
		// `/^[0-9]+/` followed by the table name — its own fake ids are
		// `padStart(32 - tableName.length, "0") + tableName`. A literal like
		// `"kg2000000000000000000000000000" as never` fails args validation
		// (`:1666`) and again at `ctx.db.insert` (`:231-239`).
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
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

		await backend.mutation(internal.agreementsInternal.recordSignature, {
			personId: id,
			email: "ada@example.com",
			variant: "member",
			signedName: "Ada Lovelace",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.onboarding?.steps.document).toBeDefined();
		expect(person?.stage).toBe("active");
	});
});

describe("legacy (drive-url) agreements do not block in-app signing", () => {
	it("a legacy sourceUrl signature of the current variant is not 'already signed'", async () => {
		// The reported bug: an imported member with only a Google Drive
		// `sourceUrl` agreement hit "Agreement already signed." on the
		// onboarding signature screen.
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "leg@example.com",
				firstName: "Leg",
				lastName: "Acy",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			await context.db.insert("signatures", {
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

		const contextData = await backend
			.withIdentity({ email: "leg@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(contextData).toMatchObject({
			variant: "member",
			alreadySigned: false,
		});
	});

	it("a native (fileId) signature of the current variant IS already signed", async () => {
		const backend = convexTest(schema, modules);
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "nat@example.com",
				firstName: "Nat",
				lastName: "Ive",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			await context.db.insert("signatures", {
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

		const contextData = await backend
			.withIdentity({ email: "nat@example.com" })
			.query(internal.agreementsInternal.signingContext, {});
		expect(contextData).toMatchObject({
			variant: "member",
			alreadySigned: true,
		});
	});

	it("recordSignature crushes the legacy same-variant row and leaves other variants", async () => {
		const backend = convexTest(schema, modules);
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		const personId = await backend.run(async (context) => {
			const id = await context.db.insert("people", {
				email: "crush@example.com",
				firstName: "Cru",
				lastName: "Sh",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			// Legacy member row (must be crushed) + a legacy row of a DIFFERENT
			// variant (must survive — only the signed variant is replaced).
			await context.db.insert("signatures", {
				personId: id,
				email: "crush@example.com",
				variant: "member",
				signedName: "Cru Sh",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				sourceUrl: "https://example.com/legacy-member.pdf",
			});
			await context.db.insert("signatures", {
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

		await backend.mutation(internal.agreementsInternal.recordSignature, {
			personId,
			email: "crush@example.com",
			variant: "member",
			signedName: "Cru Sh",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});

		const sigs = await backend.run(async (context) =>
			context.db
				.query("signatures")
				.withIndex("by_person", (range) =>
					range.eq("personId", personId)
				)
				.collect()
		);
		const member = sigs.filter(
			(signature) => signature.variant === "member"
		);
		const guest = sigs.filter((signature) => signature.variant === "guest");
		// Exactly one member row now, and it is the native one (has fileId, no
		// leftover legacy sourceUrl).
		expect(member).toHaveLength(1);
		expect(member[0].fileId).toBeDefined();
		expect(member[0].sourceUrl).toBeUndefined();
		// The different-variant legacy row is untouched.
		expect(guest).toHaveLength(1);
		expect(guest[0].sourceUrl).toBeDefined();
	});

	it("keeps the signed variant on the person exactly once over a legacy row", async () => {
		const backend = convexTest(schema, modules);
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "sv@example.com",
				firstName: "Sv",
				lastName: "",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				signedVariants: ["guest"],
			})
		);
		// The legacy row the real data has: a drive link, no stored file.
		await backend.run((context) =>
			context.db.insert("signatures", {
				personId,
				email: "sv@example.com",
				variant: "guest",
				signedName: "Sv",
				agreementVersion: "legacy",
				agreementHash: "",
				signedAt: 1,
				sourceUrl: "https://example.com/legacy.pdf",
			})
		);
		await backend.mutation(internal.agreementsInternal.recordSignature, {
			personId,
			email: "sv@example.com",
			variant: "guest",
			signedName: "Sv",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});
		const person = await backend.run((context) => context.db.get(personId));
		expect(person?.signedVariants).toEqual(["guest"]);
	});

	it("sets signedVariants on a person who had none when they sign", async () => {
		const backend = convexTest(schema, modules);
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "fresh@example.com",
				firstName: "Fresh",
				lastName: "",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		const before = await backend.run((context) => context.db.get(personId));
		expect(before?.signedVariants).toBeUndefined();
		await backend.mutation(internal.agreementsInternal.recordSignature, {
			personId,
			email: "fresh@example.com",
			variant: "guest",
			signedName: "Fresh",
			agreementVersion: "1",
			agreementHash: "h",
			signedAt: Date.now(),
			fileId,
		});
		const after = await backend.run((context) => context.db.get(personId));
		expect(after?.signedVariants).toEqual(["guest"]);
	});
});

describe("board signatures", () => {
	const BOARD_PNG =
		"data:image/png;base64," +
		Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
		]).toString("base64");

	it("setBoardSignature stores the PNG once per slug", async () => {
		const backend = convexTest(schema, modules);
		await backend.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		await backend.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		const rows = await backend.run((context) =>
			context.db.query("boardSignatures").collect()
		);
		expect(rows).toHaveLength(1);
		expect(
			await backend.run((context) =>
				context.storage.getUrl(rows[0].fileId)
			)
		).not.toBeNull();
	});

	it("rejects an unknown slug", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.action(internal.agreements.setBoardSignature, {
				slug: "nobody",
				dataUrl: BOARD_PNG,
			})
		).rejects.toThrow(/Unknown signatory slug/);
	});

	it("signAgreement stamps only the board members with an uploaded PNG", async () => {
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		await backend.action(internal.agreements.setBoardSignature, {
			slug: "hopper-grace",
			dataUrl: BOARD_PNG,
		});
		// The stored board PNG is fake bytes; only the call args matter here.
		vi.mocked(drawSignedPdf)
			.mockClear()
			.mockImplementationOnce(() => Promise.resolve(new Uint8Array([1])));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const options = vi.mocked(drawSignedPdf).mock.calls[0][1];
		expect(options.board[0].signaturePng).toBeDefined();
		expect(options.board[1].signaturePng).toBeUndefined();
	});

	it("signAgreement stamps the env signatories in order", async () => {
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		vi.mocked(drawSignedPdf)
			.mockClear()
			.mockImplementationOnce(() => Promise.resolve(new Uint8Array([1])));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend
			.withIdentity({ email: "ada@example.com" })
			.action(api.agreements.signAgreement, { signaturePng: PNG_1PX });
		logSpy.mockRestore();
		const options = vi.mocked(drawSignedPdf).mock.calls[0][1];
		expect(
			options.board.map((member) => [member.name, member.role])
		).toEqual([
			["Hopper, Grace", "President of the board"],
			["Turing, Alan", "Vice-president of the board"],
		]);
	});

	it("signAgreement fails clearly when BOARD_SIGNATORIES is unset", async () => {
		vi.stubEnv("BOARD_SIGNATORIES", "");
		const backend = convexTest(schema, modules);
		await approvedMember(backend);
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.action(api.agreements.signAgreement, {
					signaturePng: PNG_1PX,
				})
		).rejects.toThrow(/BOARD_SIGNATORIES is not configured/);
	});
});
