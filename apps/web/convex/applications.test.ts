import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";
import { stubRecaptcha } from "../test-stubs/stubRecaptcha.ts";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { validateApplicationInput } from "./applications.ts";
import { hashConfirmToken, issueToken } from "./lib/confirmToken.ts";
import { EMAIL_IN_USE, EMAIL_INVALID } from "./lib/emailAddress.ts";
import {
	EMAIL_LIMIT_COUNT,
	PUBLIC_SUBMIT_PER_HOUR,
	rateLimiter,
} from "./lib/rateLimit.ts";
import { passesRecaptcha } from "./lib/recaptcha.ts";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const seed = {
	firstName: "Ada",
	lastName: "",
	email: "ada@example.com",
	tier: "prospect" as const,
	stage: "unverified" as const,
	stageSince: 0,
};

// Full set of application input fields the public submit collects, reused by the
// insertApplication tests.
const appInput = {
	firstName: "Ada",
	lastName: "Lovelace",
	email: "ada@example.com",
	phone: "+1 555 0100",
	pastBuilt: "An analytical engine.",
	ventureName: "Engine Co",
	description: "Building general-purpose computers.",
	productStage: "prototype" as const,
	fundingStage: "bootstrapped" as const,
	vertical: ["ai" as const],
	teamSize: 3,
	links: [{ label: "", url: "https://example.com" }],
	whyJoin: "To grow Engine Co.",
};

// The confirm token the action mints and hands to insertApplication.
const TOKEN = "a".repeat(64);

// Alias used in the submitApplication verify-email test (matches the form's fields).
const VALID_INPUT = appInput;

// Only a confirm token's hash is stored, so a test that clicks the link reads
// the raw token from the email the action sent. Passes reCAPTCHA as `signup`.
function emailedConfirmToken(): () => string {
	process.env.RESEND_API_KEY = "re_test";
	onTestFinished(() => {
		delete process.env.RESEND_API_KEY;
	});
	const sent: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, init?: { body?: string }) => {
			if (url.startsWith("https://api.resend.com/")) {
				sent.push(init?.body ?? "");
				return Promise.resolve({ ok: true });
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						action: "signup",
						score: 0.9,
					}),
			});
		})
	);
	return () => {
		for (const body of sent) {
			const html = (JSON.parse(body) as { html: string }).html;
			const token = /token=([0-9a-f]{64})/.exec(html)?.[1];
			if (token) return token;
		}
		throw new Error("no confirm link emailed");
	};
}

const BOARD_EMAIL = "boss@example.com";

async function seedBoard(backend: ReturnType<typeof convexTest>) {
	const boardId = await backend.run(async (context) =>
		context.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { boardId, asBoard: backend.withIdentity({ email: BOARD_EMAIL }) };
}

async function seedEvent(backend: ReturnType<typeof convexTest>) {
	const { asBoard } = await seedBoard(backend);
	return asBoard.mutation(api.events.createEvent, {
		name: "Hack Night",
		startsAtLocal: zonedLocalFromEpoch(Date.now(), SITE_TIMEZONE),
		endsAtLocal: zonedLocalFromEpoch(
			Date.now() + 86_400_000,
			SITE_TIMEZONE
		),
	});
}

describe("applications", () => {
	it("lists applications", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				...seed,
				stage: "verified",
				verifiedAt: 1,
			})
		);
		const all = await asBoard.query(api.applications.list, {});
		expect(all).toHaveLength(1);
		expect(all[0].firstName).toBe("Ada");
	});

	it("list excludes unverified applications", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				firstName: "V",
				lastName: "",
				email: "v@example.com",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: 1,
			});
			await context.db.insert("people", {
				firstName: "U",
				lastName: "",
				email: "u@example.com",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			});
		});
		const rows = await asBoard.query(api.applications.list, {});
		expect(rows.map((row) => row.email)).toEqual(["v@example.com"]);
	});

	it("setScore stores the score and moves a verified prospect into the queue", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		await asBoard.mutation(api.applications.setScore, {
			personId: id,
			value: 7,
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.board?.score).toBe(7);
		expect(person?.stage).toBe("queued");
	});

	/**
	 * `setScore` writes the score patch and the `field_edit` audit row BEFORE
	 * asking the machine, then calls `SET_SCORE` through `applyEventIfLegal`,
	 * which silently swallows an illegal transition. That ordering is
	 * prescribed (this task does not change it) — but it means `setScore` is
	 * the one mutation in this task where an ILLEGAL action still writes. A
	 * member is not a state `SET_SCORE` has any rule for, so this documents
	 * exactly what happens: the score and its audit row land, the tier/stage
	 * are untouched, and no "transition" row is ever written for it.
	 */
	it("documents that setScore still writes the score and its audit row even when SET_SCORE is not legal for the person's state", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.applications.setScore, {
			personId: id,
			value: 9,
		});

		const person = await backend.run(async (context) => context.db.get(id));
		// The score patch happened...
		expect(person?.board?.score).toBe(9);
		// ...but the illegal SET_SCORE never moved this member anywhere.
		expect(person?.tier).toBe("member");
		expect(person?.stage).toBe("active");
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(
			events.some(
				(event) =>
					event.kind === "field_edit" && event.field === "board.score"
			)
		).toBe(true);
		expect(events.some((event) => event.kind === "transition")).toBe(false);
	});

	it("setScore is a no-op when the value is unchanged (no write, no audit noise)", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		// Clearing an already-unscored person writes nothing — no `board`, no event.
		await asBoard.mutation(api.applications.setScore, { personId: id });
		let person = await backend.run(async (context) => context.db.get(id));
		expect(person?.board).toBeUndefined();

		// Re-setting the same score is a no-op too: exactly one field_edit total.
		await asBoard.mutation(api.applications.setScore, {
			personId: id,
			value: 5,
		});
		await asBoard.mutation(api.applications.setScore, {
			personId: id,
			value: 5,
		});
		person = await backend.run(async (context) => context.db.get(id));
		expect(person?.board?.score).toBe(5);
		const edits = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(
			edits.filter(
				(event) =>
					event.kind === "field_edit" && event.field === "board.score"
			)
		).toHaveLength(1);
	});

	it("setScore with no value clears the score and leaves a queued prospect queued", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		// Score first: moves the prospect into the queue.
		await asBoard.mutation(api.applications.setScore, {
			personId: id,
			value: 7,
		});
		const scored = await backend.run((context) => context.db.get(id));
		expect(scored?.stage).toBe("queued");

		// Clearing (no value) wipes the number but does NOT bounce them out of
		// the queue — clearing fires no lifecycle event.
		await asBoard.mutation(api.applications.setScore, { personId: id });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.board?.score).toBeUndefined();
		expect(person?.stage).toBe("queued");
		// The clear is audited too: a 7 → undefined field edit.
		const cleared = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(
			cleared.some(
				(event) =>
					event.kind === "field_edit" &&
					event.field === "board.score" &&
					event.before === 7 &&
					event.after === undefined
			)
		).toBe(true);
	});
});

describe("applications.decide", () => {
	it("approves a verified prospect as a guest with a window and a host", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard, boardId } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);
		const until = Date.now() + 30 * 86_400_000;

		await asBoard.mutation(api.applications.decide, {
			personId: id,
			decision: { kind: "guest", until, hostedById: boardId },
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.tier).toBe("guest");
		expect(person?.stage).toBe("onboarding");
		expect(person?.accessUntil).toBe(until);
		expect(person?.hostedById).toBe(boardId);
	});

	it("approves a guest with no expiry at all", async () => {
		// The expiry is OPTIONAL. It was optional before the lifecycle cutover
		// (`APPROVE_GUEST` made it mandatory), and the board still needs it for
		// a resident with no end date in sight. `sendApprovalEmail` already
		// branches on a missing `accessUntil` to send the windowless variant.
		const backend = convexTest(schema, modules);
		const { asBoard, boardId } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		await asBoard.mutation(api.applications.decide, {
			personId: id,
			decision: { kind: "guest", hostedById: boardId },
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.tier).toBe("guest");
		expect(person?.stage).toBe("onboarding");
		expect(person?.accessUntil).toBeUndefined();
		expect(person?.accessFrom).toBeTypeOf("number");
		expect(person?.hostedById).toBe(boardId);
	});

	it("withholds the door in the same breath as the approval", async () => {
		// One transaction: a guest is never briefly approved WITH a key before
		// a second call takes it away.
		const backend = convexTest(schema, modules);
		const { asBoard, boardId } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);
		const until = Date.now() + 30 * 86_400_000;

		await asBoard.mutation(api.applications.decide, {
			personId: id,
			decision: {
				kind: "guest",
				until,
				hostedById: boardId,
				blockDoor: true,
			},
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.tier).toBe("guest");
		expect(person?.door?.override).toBe("force_off");
		// Logged the same way the drawer's own control logs it, so the history
		// does not depend on which surface the decision was made from.
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		const door = events.filter((event) => event.kind === "door");
		expect(door).toHaveLength(1);
		expect(door[0].after).toBe("force_off");
	});

	it("leaves the door alone when access is allowed", async () => {
		// "Yes" is not an override — it must not write `force_on`, which would
		// outlive the access window it is supposed to follow.
		const backend = convexTest(schema, modules);
		const { asBoard, boardId } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		await asBoard.mutation(api.applications.decide, {
			personId: id,
			decision: {
				kind: "guest",
				until: Date.now() + 30 * 86_400_000,
				hostedById: boardId,
				blockDoor: false,
			},
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.door?.override ?? "none").toBe("none");
	});

	it("stamps deniedAt on a denial and lets the board undo it", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "queued",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		await asBoard.mutation(api.applications.decide, {
			personId: id,
			decision: { kind: "deny" },
		});
		expect(
			await backend.run(async (context) => {
				const record = await context.db.get(id);
				return record?.deniedAt;
			})
		).toBeTypeOf("number");

		await asBoard.mutation(api.applications.undeny, { personId: id });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.stage).toBe("queued");
		expect(person?.deniedAt).toBeUndefined();
	});

	it("refuses to approve a prospect who never confirmed their email, and writes nothing at all", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const stageSince = Date.now();
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "unverified",
				stageSince,
			})
		);

		await expect(
			asBoard.mutation(api.applications.decide, {
				personId: id,
				decision: { kind: "member" },
			})
		).rejects.toThrow(/Illegal transition/);

		// An illegal event must leave the row, the audit log and the scheduler
		// completely untouched — `reduce` throws before `applyEvent`'s first
		// write, so there is nothing to roll back.
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.tier).toBe("prospect");
		expect(person?.stage).toBe("unverified");
		expect(person?.stageSince).toBe(stageSince);
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events).toHaveLength(0);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(0);
	});

	// `board.active` has never had an `APPROVE_*`/`DENY` edge in `TABLE`, so a
	// board member is protected structurally now rather than by the old
	// "never downgrades or touches a board person" check on `type`. This is
	// that same guard re-homed at the new layer: it would catch a future
	// stray edge added to `board.active` by mistake.
	it("never touches a board person: decide() is illegal from board.active", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const boardPersonId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "other-board@example.com",
				firstName: "Other",
				lastName: "Board",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await expect(
			asBoard.mutation(api.applications.decide, {
				personId: boardPersonId,
				decision: { kind: "member" },
			})
		).rejects.toThrow(/Illegal transition/);

		const person = await backend.run(async (context) =>
			context.db.get(boardPersonId)
		);
		expect(person?.tier).toBe("board");
		expect(person?.stage).toBe("active");
	});
});

describe("insertApplication", () => {
	it("inserts a pending application row", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.mutation(
			internal.applications.insertApplication,
			{
				...appInput,
				token: TOKEN,
			}
		);
		const doc = await backend.run(async (context) => context.db.get(id));
		expect(doc?.tier).toBe("prospect");
		expect(doc?.stage).toBe("unverified");
		expect(doc?.firstName).toBe("Ada");
		expect(doc?.lastName).toBe("Lovelace");
		expect(doc?.venture?.name).toBe("Engine Co");
		expect(doc?.vertical).toEqual(["ai"]);
		expect(typeof doc?.submittedAt).toBe("number");
		expect(doc?.verifiedAt).toBeUndefined();
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			tokenHash: await hashConfirmToken(TOKEN),
			purpose: "application",
			personId: id,
		});
		expect(tokens[0].payload).toBeUndefined();
	});

	it("a blocked application that races the action throws a reason-free error", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				...seed,
				email: appInput.email,
				tier: "member",
				stage: "active",
			})
		);
		const err = await backend
			.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
			})
			.catch((error: unknown) => error as Error);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/Cannot apply$/);
	});

	it("schedules a link reputation check when the application has links", async () => {
		const backend = convexTest(schema, modules);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "");
		// The check warns (not logs) when the key is unset; capture that too.
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await runAndCollectLogs(backend, () =>
				backend.mutation(internal.applications.insertApplication, {
					...appInput,
					token: TOKEN,
				})
			);
			const warned = warnSpy.mock.calls.map((call) =>
				call.map(String).join(" ")
			);
			expect(warned.join("\n")).toContain(
				"[linkSafety] SAFE_BROWSING_API_KEY not set"
			);
		} finally {
			warnSpy.mockRestore();
			vi.unstubAllEnvs();
		}
	});

	it("upserts the existing unverified row for the same email (no duplicate)", async () => {
		const backend = convexTest(schema, modules);
		const first = await backend.mutation(
			internal.applications.insertApplication,
			{ ...appInput, token: TOKEN }
		);
		const second = await backend.mutation(
			internal.applications.insertApplication,
			{
				...appInput,
				token: TOKEN,
				ventureName: "Engine Co v2",
			}
		);
		expect(second).toBe(first);
		const all = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(all).toHaveLength(1);
		expect(all[0].venture?.name).toBe("Engine Co v2");
	});

	it("reuses the existing row when the email differs only in case, and stores it lowercased", async () => {
		const backend = convexTest(schema, modules);
		const first = await backend.mutation(
			internal.applications.insertApplication,
			{ ...appInput, token: TOKEN }
		);
		const second = await backend.mutation(
			internal.applications.insertApplication,
			{ ...appInput, token: TOKEN, email: "Ada@Example.COM" }
		);
		expect(second).toBe(first);
		const all = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(all.map((person) => person.email)).toEqual([appInput.email]);
	});

	it("reuses the row on an edit-before-confirm re-submission", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Old",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
				venture: { name: "Old Co" },
			});
		});

		await backend.mutation(internal.applications.insertApplication, {
			...appInput,
			email: "ada@example.com",
			ventureName: "New Co",
			token: "tok",
		});

		const rows = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].venture?.name).toBe("New Co");
		expect(rows[0].stage).toBe("unverified");
	});
});

describe("validateApplicationInput", () => {
	it("accepts a fully valid input", () => {
		expect(() => {
			validateApplicationInput(appInput);
		}).not.toThrow();
	});

	it("rejects teamSize of 0", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, teamSize: 0 });
		}).toThrow("Invalid application input");
	});

	it("rejects a negative teamSize", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, teamSize: -3 });
		}).toThrow("Invalid application input");
	});

	it("rejects a non-integer teamSize", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, teamSize: 2.5 });
		}).toThrow("Invalid application input");
	});

	it("rejects an empty vertical array", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, vertical: [] });
		}).toThrow("Invalid application input");
	});

	it("rejects a malformed email", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, email: "not-an-email" });
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long firstName", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				firstName: "a".repeat(201),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long lastName", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				lastName: "a".repeat(201),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long ventureName", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				ventureName: "a".repeat(301),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long phone", () => {
		expect(() => {
			validateApplicationInput({ ...appInput, phone: "1".repeat(51) });
		}).toThrow("Invalid application input");
	});

	it("rejects an email longer than 254 characters", () => {
		const local = "a".repeat(250);
		expect(() => {
			validateApplicationInput({ ...appInput, email: `${local}@x.co` });
		}).toThrow("Invalid application input");
	});

	it("accepts an email of exactly 254 characters", () => {
		const local = "a".repeat(249);
		expect(() => {
			validateApplicationInput({ ...appInput, email: `${local}@x.co` });
		}).not.toThrow();
	});

	it("rejects an over-long referral", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				referral: "a".repeat(321),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long pastBuilt", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				pastBuilt: "a".repeat(5001),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long description", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				description: "a".repeat(5001),
			});
		}).toThrow("Invalid application input");
	});

	it("rejects an over-long whyJoin", () => {
		expect(() => {
			validateApplicationInput({
				...appInput,
				whyJoin: "a".repeat(5001),
			});
		}).toThrow("Invalid application input");
	});
});

describe("insertApplication validation", () => {
	it("rejects a link with an empty url (the link normalizer's check)", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
				links: [{ label: "site", url: "" }],
			})
		).rejects.toThrow("Links must use http or https.");
		expect(
			await backend.run((context) => context.db.query("people").collect())
		).toHaveLength(0);
	});

	it("rejects more than 4 links", async () => {
		const backend = convexTest(schema, modules);
		const links = Array.from({ length: 5 }, () => ({
			label: "",
			url: "https://example.com",
		}));
		await expect(
			backend.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
				links,
			})
		).rejects.toThrow("Too many links (max 4).");
	});

	it("rejects an over-long link url", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
				links: [{ label: "", url: `https://x.co/${"a".repeat(2001)}` }],
			})
		).rejects.toThrow("Link is too long.");
	});

	it("rejects an over-long link label", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
				links: [{ label: "a".repeat(201), url: "https://example.com" }],
			})
		).rejects.toThrow("Link is too long.");
	});

	it("stores the links normalized", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.mutation(
			internal.applications.insertApplication,
			{
				...appInput,
				token: TOKEN,
				links: [{ label: "", url: "  https://example.com/a  " }],
			}
		);
		const doc = await backend.run((context) => context.db.get(id));
		expect(doc?.venture?.links).toEqual([
			{ label: "", url: "https://example.com/a" },
		]);
	});

	it("rejects malformed input before writing any row", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.applications.insertApplication, {
				...appInput,
				token: TOKEN,
				teamSize: 0,
			})
		).rejects.toThrow("Invalid application input");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});
});

function passFetch() {
	stubRecaptcha({
		success: true,
		action: "signup",
		score: 0.9,
	});
}

function captureEmails() {
	process.env.RESEND_API_KEY = "re_test";
	process.env.RECAPTCHA_SECRET = "secret";
	const sent: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, init?: { body?: string }) => {
			if (url.includes("api.resend.com")) {
				sent.push(init?.body ?? "");
				return Promise.resolve({ ok: true });
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						action: "signup",
						score: 0.9,
					}),
			});
		})
	);
	return sent;
}

function subjectOf(body: string): string {
	return (JSON.parse(body) as { subject: string }).subject;
}

describe("submitApplication", () => {
	const validToken = { ...appInput, token: "x" };

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("throws a distinct error when the reCAPTCHA secret is not configured", async () => {
		delete process.env.RECAPTCHA_SECRET;
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await expect(
			backend.action(api.applications.submitApplication, validToken)
		).rejects.toThrow("reCAPTCHA is not configured");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});

	it("treats a rejected fetch as a verification failure (generic error, no row)", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("network down")))
		);
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await expect(
			backend.action(api.applications.submitApplication, validToken)
		).rejects.toThrow("Couldn't verify you're human — please try again.");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});

	it("treats a non-2xx response as a verification failure (generic error, no row)", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: false,
					json: () =>
						Promise.resolve({
							success: true,
							action: "signup",
							score: 0.9,
						}),
				})
			)
		);
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await expect(
			backend.action(api.applications.submitApplication, validToken)
		).rejects.toThrow("Couldn't verify you're human — please try again.");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});

	it("treats a non-JSON body as a verification failure (generic error, no row)", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.reject(new SyntaxError("not json")),
				})
			)
		);
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await expect(
			backend.action(api.applications.submitApplication, validToken)
		).rejects.toThrow("Couldn't verify you're human — please try again.");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});

	it("inserts a pending row on a passing verification and does not store the token", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		stubRecaptcha({
			success: true,
			action: "signup",
			score: 0.9,
		});
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		expect(result).toEqual({ status: "pending" });
		const documents = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(documents).toHaveLength(1);
		const doc = documents[0];
		expect(doc.tier).toBe("prospect");
		expect(doc.stage).toBe("unverified");
		expect(doc.email).toBe(appInput.email);
		expect(doc.venture?.name).toBe(appInput.ventureName);
		expect((doc as Record<string, unknown>).token).toBeUndefined();
	});

	it("throws on invalid input even when verification passes", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		stubRecaptcha({
			success: true,
			action: "signup",
			score: 0.9,
		});
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await expect(
			backend.action(api.applications.submitApplication, {
				...validToken,
				teamSize: 0,
			})
		).rejects.toThrow("Invalid application input");
		const all = await backend.run(async (context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(0);
	});

	it("sends a verify-application email (not application-received) on a fresh submit", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend.action(api.applications.submitApplication, validToken);
		const msgs = logSpy.mock.calls.map((call) => call.join(" "));
		logSpy.mockRestore();
		expect(
			msgs.some((message) => message.includes("[verify-application]"))
		).toBe(true);
		expect(
			msgs.some((message) => message.includes("[application-received]"))
		).toBe(false);
	});

	describe("submitted text never reaches an unconfirmed address", () => {
		const typed = {
			...validToken,
			firstName: "Mallory",
			lastName: "Attacker",
			ventureName: "URGENT pay https://evil.example/pay",
		};
		const SUBMITTED = ["Mallory", "Attacker", "URGENT", "evil.example"];

		afterEach(() => {
			delete process.env.RESEND_API_KEY;
		});

		async function submitAgainst(existing: Record<string, unknown> | null) {
			const sent = captureEmails();
			const backend = convexTest(schema, modules);
			registerRateLimiter(backend);
			if (existing) {
				await backend.run(async (context) =>
					context.db.insert("people", {
						email: appInput.email,
						firstName: "Ada",
						lastName: "",
						tier: "prospect",
						stage: "verified",
						stageSince: Date.now(),
						...existing,
					})
				);
			}
			await backend.action(api.applications.submitApplication, typed);
			expect(sent).toHaveLength(1);
			return sent[0];
		}

		function expectNoSubmittedText(body: string) {
			for (const word of SUBMITTED) expect(body).not.toContain(word);
		}

		it("verify email", async () => {
			const body = await submitAgainst(null);
			expect(subjectOf(body)).toBe("Confirm your J floor application");
			expectNoSubmittedText(body);
		});

		it("already-active email names the stored person, not the typed name", async () => {
			const body = await submitAgainst({
				firstName: "Grace",
				tier: "member",
				stage: "active",
			});
			expect(subjectOf(body)).toBe("You already have access to J floor");
			expectNoSubmittedText(body);
			expect(body).toContain("Grace");
		});

		it("debounce email", async () => {
			const body = await submitAgainst({
				firstName: "Grace",
				stage: "denied",
				deniedAt: Date.now() - 1000,
			});
			expect(subjectOf(body)).toBe("About your J floor application");
			expectNoSubmittedText(body);
		});

		it("under-review email", async () => {
			const body = await submitAgainst({
				firstName: "Grace",
				verifiedAt: Date.now() - 1000,
			});
			expect(subjectOf(body)).toBe(
				"Your J floor application is with the board"
			);
			expectNoSubmittedText(body);
		});
	});

	it("blocks (writes no row) and emails when the person already has access", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: appInput.email,
				firstName: "Ada",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		const msgs = logSpy.mock.calls.map((call) => call.join(" "));
		logSpy.mockRestore();
		expect(result).toEqual({ status: "pending" });
		const apps = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(apps).toHaveLength(1); // only the pre-existing member row
		expect(
			msgs.some((message) => message.includes("[already-active]"))
		).toBe(true);
	});

	it("matches an active member whatever the case of the submitted email", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: appInput.email,
				firstName: "Ada",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(
			api.applications.submitApplication,
			{
				...validToken,
				email: "ADA@example.com",
			}
		);
		const msgs = logSpy.mock.calls.map((call) => call.join(" "));
		logSpy.mockRestore();
		expect(
			msgs.some((message) =>
				message.includes("[already-active] ada@example.com")
			)
		).toBe(true);
		expect(result).toEqual({ status: "pending" });
		const people = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(people.map((person) => person.email)).toEqual([appInput.email]);
	});

	it.each([
		["a zero team size", { teamSize: 0 }],
		[
			"an unsafe link",
			{ links: [{ label: "x", url: "javascript:alert(1)" }] },
		],
	])(
		"rejects %s identically for a member and an unknown address",
		async (_name, bad) => {
			process.env.RECAPTCHA_SECRET = "secret";
			passFetch();
			const backend = convexTest(schema, modules);
			registerRateLimiter(backend);
			await backend.run(async (context) =>
				context.db.insert("people", {
					email: "member@example.com",
					firstName: "Mem",
					lastName: "",
					tier: "member",
					stage: "active",
					stageSince: Date.now(),
				})
			);
			async function messageFor(email: string) {
				try {
					await backend.action(api.applications.submitApplication, {
						...validToken,
						email,
						...bad,
					});
				} catch (error) {
					return error instanceof Error
						? error.message
						: String(error);
				}
				return "no error";
			}
			const forMember = await messageFor("member@example.com");
			const forStranger = await messageFor("stranger@example.com");
			expect(forStranger).not.toBe("no error");
			expect(forMember).toBe(forStranger);
		}
	);

	it("submit writes an UNVERIFIED row and logs the verify email (not received)", async () => {
		process.env.RECAPTCHA_SECRET = "x";
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		// Stub siteverify to succeed.
		stubRecaptcha({
			success: true,
			action: "signup",
			score: 0.9,
		});
		const result = await backend.action(
			api.applications.submitApplication,
			{
				...VALID_INPUT,
				token: "t",
			}
		);
		expect(result).toEqual({ status: "pending" });
		const row = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VALID_INPUT.email)
				)
				.unique()
		);
		expect(row?.verifiedAt).toBeUndefined();
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
		expect(tokens[0].purpose).toBe("application");
		expect(tokens[0].personId).toBe(row?._id);
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		expect(
			logs.some((message) => message.includes("[verify-application]"))
		).toBe(true);
		expect(
			logs.some((message) => message.includes("[application-received]"))
		).toBe(false);
		logSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("blocks (writes no row) and emails when a denial is within the debounce", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				firstName: "Ada",
				lastName: "",
				email: appInput.email,
				tier: "prospect",
				stage: "denied",
				stageSince: Date.now(),
				deniedAt: Date.now() - 1000,
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		const msgs = logSpy.mock.calls.map((call) => call.join(" "));
		logSpy.mockRestore();
		expect(result).toEqual({ status: "pending" });
		const apps = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(apps).toHaveLength(1); // only the pre-existing denied row
		expect(
			msgs.some((message) => message.includes("[reapply-after]"))
		).toBe(true);
	});

	it("blocks and emails already-under-review when a verified pending application exists", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		// Insert a verified, non-denied prospect row for the same email.
		await backend.run(async (context) =>
			context.db.insert("people", {
				firstName: "Ada",
				lastName: "",
				email: appInput.email,
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now() - 1000,
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		const msgs = logSpy.mock.calls.map((call) => call.join(" "));
		logSpy.mockRestore();
		expect(result).toEqual({ status: "pending" });
		// Told by email, not by the response.
		expect(
			msgs.some((message) =>
				message.includes("[already-under-review] ada@example.com")
			)
		).toBe(true);
		expect(
			msgs.some((message) => message.includes("[already-active]"))
		).toBe(false);
		expect(
			msgs.some((message) => message.includes("[reapply-after]"))
		).toBe(false);
		expect(
			msgs.some((message) => message.includes("[verify-application]"))
		).toBe(false);
		// The pre-existing row is unchanged; no new row inserted.
		const apps = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(apps).toHaveLength(1);
	});

	it("a confirmed event visitor's application is staged: same person, nothing changes until confirmed, attendance kept", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		const emailedToken = emailedConfirmToken();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const eventId = await seedEvent(backend);
		const visitorId = await backend.run(async (context) => {
			const id = await context.db.insert("people", {
				email: appInput.email,
				firstName: "Ada",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now() - 1000,
				provenance: "signup",
				door: { override: "none" },
				board: {},
			});
			await context.db.insert("eventAttendance", {
				personId: id,
				eventId,
				confirmedAt: Date.now() - 1000,
			});
			return id;
		});

		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		expect(result).toEqual({ status: "pending" });

		const people = await backend.run(async (context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", appInput.email)
				)
				.collect()
		);
		expect(people).toHaveLength(1);
		expect(people[0]._id).toBe(visitorId);
		expect(people[0].tier).toBe("visitor");
		expect(people[0].stage).toBe("verified");
		expect(people[0].lastName).toBe("Visitor");
		const staged = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(staged).toHaveLength(1);
		expect(staged[0].payload?.lastName).toBe("Lovelace");

		await backend.mutation(
			internal.applications.confirmApplicationByToken,
			{
				token: emailedToken(),
			}
		);
		const confirmed = (await backend.run((context) =>
			context.db.get(visitorId)
		))!;
		expect(confirmed.tier).toBe("prospect");
		expect(confirmed.lastName).toBe("Lovelace");

		const attendance = await backend.run((context) =>
			context.db
				.query("eventAttendance")
				.withIndex("by_person", (range) =>
					range.eq("personId", visitorId)
				)
				.collect()
		);
		expect(attendance).toHaveLength(1);
		expect(attendance[0].eventId).toBe(eventId);
	});

	it("lets an unconfirmed event visitor apply, then records attendance on apply confirm", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		const emailedToken = emailedConfirmToken();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const eventId = await seedEvent(backend);
		const visitorId = await backend.run((context) =>
			context.db.insert("people", {
				email: appInput.email,
				firstName: "Ada",
				lastName: "Visitor",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "signup",
				door: { override: "none" },
				board: {},
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "visitor-tok",
				purpose: "visitor",
				personId: visitorId,
				eventId,
				ttlMs: 1000 * 60 * 60,
			})
		);

		const submitted = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		expect(submitted).toEqual({ status: "pending" });

		const afterSubmit = await backend.run((context) =>
			context.db.get(visitorId)
		);
		expect(afterSubmit?.tier).toBe("prospect");
		expect(afterSubmit?.stage).toBe("unverified");
		const appToken = await backend.run((context) =>
			context.db
				.query("confirmTokens")
				.withIndex("by_person_purpose", (range) =>
					range.eq("personId", visitorId).eq("purpose", "application")
				)
				.unique()
		);
		expect(appToken?.tokenHash).toBe(
			await hashConfirmToken(emailedToken())
		);
		expect(appToken?.tokenHash).not.toBe(
			await hashConfirmToken("visitor-tok")
		);

		const confirmed = await backend.action(
			api.applications.confirmApplication,
			{
				token: emailedToken(),
			}
		);
		expect(confirmed).toEqual({ status: "verified" });

		const afterConfirm = await backend.run((context) =>
			context.db.get(visitorId)
		);
		expect(afterConfirm?.tier).toBe("prospect");
		expect(afterConfirm?.stage).toBe("verified");

		const attendance = await backend.run((context) =>
			context.db
				.query("eventAttendance")
				.withIndex("by_person", (range) =>
					range.eq("personId", visitorId)
				)
				.collect()
		);
		expect(attendance).toHaveLength(1);
		expect(attendance[0].eventId).toBe(eventId);
	});

	it("throttles a burst of confirm emails to one applicant address, but still returns pending", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const args = {
			...appInput,
			email: "burst@example.org",
			token: "captcha",
		};

		// EMAIL_LIMIT_COUNT allowed, one more throttled — all return "pending".
		for (let index = 0; index <= EMAIL_LIMIT_COUNT; index++) {
			const result = await backend.action(
				api.applications.submitApplication,
				args
			);
			expect(result).toEqual({ status: "pending" });
		}

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		// Only EMAIL_LIMIT_COUNT verify-application sends actually went out —
		// the devLog fallback fires once per real send, so the throttled call
		// must not add an extra line.
		expect(
			logs.filter((message) =>
				message.includes("[verify-application] burst@example.org")
			)
		).toHaveLength(EMAIL_LIMIT_COUNT);
	});

	it("a different applicant address in the same window is unaffected by another address's throttling", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);

		// Exhaust the limit for one address.
		for (let index = 0; index < 4; index++) {
			await backend.action(api.applications.submitApplication, {
				...appInput,
				email: "burst2@example.org",
				token: "captcha",
			});
		}

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(
			api.applications.submitApplication,
			{
				...appInput,
				email: "unaffected@example.org",
				token: "captcha",
			}
		);
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(result).toEqual({ status: "pending" });
		expect(
			logs.some((message) =>
				message.includes("[verify-application] unaffected@example.org")
			)
		).toBe(true);
	});

	it("a throttled confirm-path re-submit leaves the armed row untouched and fires no REAPPLY", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const args = {
			...appInput,
			email: "clobber@example.org",
			token: "captcha",
		};

		// Exhaust the per-address limit with real, delivered confirm sends.
		for (let index = 0; index < EMAIL_LIMIT_COUNT; index++) {
			expect(
				await backend.action(api.applications.submitApplication, args)
			).toEqual({ status: "pending" });
		}
		const armed = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "clobber@example.org")
				)
				.unique()
		);
		if (!armed) throw new Error("expected an armed row");
		const eventsBefore = await backend.run((context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) =>
					range.eq("personId", armed._id)
				)
				.collect()
		);

		// Throttled: must return the SAME neutral status a DELIVERED confirm
		// returns (enumeration parity) WITHOUT re-arming the verify token via
		// insertApplication (which would also fire another REAPPLY) — so the
		// last-delivered confirm link stays valid instead of being overwritten
		// with no replacement sent.
		expect(
			await backend.action(api.applications.submitApplication, args)
		).toEqual({ status: "pending" });
		const after = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "clobber@example.org")
				)
				.unique()
		);
		expect(after).toEqual(armed);
		const eventsAfter = await backend.run((context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) =>
					range.eq("personId", armed._id)
				)
				.collect()
		);
		expect(eventsAfter).toHaveLength(eventsBefore.length);
	});

	it("throttles a burst of already-active emails to one address, but still returns pending each time", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: appInput.email,
				firstName: "Ada",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		// EMAIL_LIMIT_COUNT allowed, one more throttled — all return "pending".
		for (let index = 0; index <= EMAIL_LIMIT_COUNT; index++) {
			const result = await backend.action(
				api.applications.submitApplication,
				validToken
			);
			expect(result).toEqual({ status: "pending" });
		}

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.filter((message) =>
				message.includes(`[already-active] ${appInput.email}`)
			)
		).toHaveLength(EMAIL_LIMIT_COUNT);
	});

	it("throttles a burst of reapply-after emails to one denied address, but still returns pending each time", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				firstName: "Ada",
				lastName: "",
				email: appInput.email,
				tier: "prospect",
				stage: "denied",
				stageSince: Date.now(),
				deniedAt: Date.now() - 1000,
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		// EMAIL_LIMIT_COUNT allowed, one more throttled — all return "pending".
		for (let index = 0; index <= EMAIL_LIMIT_COUNT; index++) {
			const result = await backend.action(
				api.applications.submitApplication,
				validToken
			);
			expect(result).toEqual({ status: "pending" });
		}

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.filter((message) =>
				message.includes(`[reapply-after] ${appInput.email}`)
			)
		).toHaveLength(EMAIL_LIMIT_COUNT);
	});

	it("the global publicSubmit cap, checked after reCAPTCHA passes, answers pending, warns and writes nothing", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (let index = 0; index < PUBLIC_SUBMIT_PER_HOUR; index++) {
			await backend.run((context) =>
				rateLimiter.limit(context, "publicSubmit")
			);
		}
		const result = await backend.action(
			api.applications.submitApplication,
			validToken
		);
		expect(result).toEqual({ status: "pending" });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("publicSubmit");
		expect(
			await backend.run((context) => context.db.query("people").collect())
		).toHaveLength(0);
		warn.mockRestore();
	});

	it("a failed reCAPTCHA does not spend the global publicSubmit cap", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		stubRecaptcha({ success: false, action: "signup", score: 0 });
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		for (let index = 0; index < PUBLIC_SUBMIT_PER_HOUR - 1; index++) {
			await backend.run((context) =>
				rateLimiter.limit(context, "publicSubmit")
			);
		}
		await expect(
			backend.action(api.applications.submitApplication, validToken)
		).rejects.toThrow("Couldn't verify");
		const { ok } = await backend.run((context) =>
			rateLimiter.limit(context, "publicSubmit")
		);
		expect(ok).toBe(true);
	});
});

describe("passesRecaptcha", () => {
	it("accepts a successful verification for the matching action above threshold", () => {
		expect(
			passesRecaptcha(
				{ success: true, action: "signup", score: 0.5 },
				"signup"
			)
		).toBe(true);
	});

	it("rejects a low score", () => {
		expect(
			passesRecaptcha(
				{ success: true, action: "signup", score: 0.4 },
				"signup"
			)
		).toBe(false);
	});

	it("rejects a mismatched action", () => {
		expect(
			passesRecaptcha(
				{ success: true, action: "login", score: 0.9 },
				"signup"
			)
		).toBe(false);
	});

	it("rejects an unsuccessful verification", () => {
		expect(
			passesRecaptcha(
				{ success: false, action: "signup", score: 0.9 },
				"signup"
			)
		).toBe(false);
	});
});

async function seedUnverified(backend: ReturnType<typeof convexTest>) {
	return backend.run((context) =>
		context.db.insert("people", {
			firstName: "Ada",
			lastName: "Lovelace",
			email: "ada@example.com",
			tier: "prospect",
			stage: "unverified",
			stageSince: Date.now(),
		})
	);
}

describe("confirmApplication", () => {
	it("confirmApplication verifies a valid token and schedules the received email", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedUnverified(backend);
		await backend.run((context) =>
			issueToken(context, {
				token: "tok",
				purpose: "application",
				personId: id,
				ttlMs: 1000,
			})
		);
		const result = await backend.action(
			api.applications.confirmApplication,
			{
				token: "tok",
			}
		);
		expect(result.status).toBe("verified");
		const row = await backend.run((context) => context.db.get(id));
		expect(row?.verifiedAt).toBeTypeOf("number");
		expect(row?.stage).toBe("verified");
		const events = await backend.run((context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(
			events.some(
				(event) =>
					event.kind === "email" &&
					event.meta === "applicationReceived"
			)
		).toBe(true);
		// The audit row alone doesn't prove the RIGHT function was scheduled:
		// convex-test never executes a scheduled action, so the only way to
		// catch the wrong email being wired to VERIFY_EMAIL's effect is to read
		// `_scheduled_functions` directly (see `convex/lifecycle.test.ts`).
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendApplicationReceivedEmail",
					args: [{ email: "ada@example.com" }],
				}),
				expect.objectContaining({
					name: "notify/dispatch:run",
					args: [expect.objectContaining({ kind: "newApplication" })],
				}),
			])
		);
	});

	it("a stranger's re-application for a former member changes nothing until confirmed", async () => {
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const formerId = await backend.run((context) =>
			context.db.insert("people", {
				...seed,
				email: "former@example.com",
				tier: "former",
				stage: "active",
				firstName: "Old",
				phone: "+1 555 0101",
				verifiedAt: 1,
			})
		);
		await backend.mutation(internal.applications.insertApplication, {
			...VALID_INPUT,
			email: "former@example.com",
			firstName: "Imposter",
			phone: "+1 555 0102",
			token: "tok1",
		});
		const person = (await backend.run((context) =>
			context.db.get(formerId)
		))!;
		expect(person.firstName).toBe("Old");
		expect(person.phone).toBe("+1 555 0101");
		expect(person.tier).toBe("former");
		expect(person.verifiedAt).toBe(1);
		const rows = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].payload?.firstName).toBe("Imposter");
		expect(
			await backend.run((context) =>
				context.db.query("personEvents").collect()
			)
		).toHaveLength(0);

		const result = await backend.mutation(
			internal.applications.confirmApplicationByToken,
			{ token: "tok1" }
		);
		expect(result.status).toBe("verified");
		const after = (await backend.run((context) =>
			context.db.get(formerId)
		))!;
		expect(after.firstName).toBe("Imposter");
		expect(after.tier).toBe("prospect");
		expect(after.stage).toBe("verified");
		const events = await backend.run((context) =>
			context.db.query("personEvents").collect()
		);
		expect(
			events.flatMap((event) => (event.event ? [event.event] : []))
		).toEqual(["REAPPLY", "VERIFY_EMAIL"]);
	});

	it("a staged token redeemed after the person became active is invalid and changes nothing", async () => {
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				...seed,
				email: "former@example.com",
				tier: "former",
				stage: "active",
				firstName: "Old",
				verifiedAt: 1,
			})
		);
		await backend.mutation(internal.applications.insertApplication, {
			...VALID_INPUT,
			email: "former@example.com",
			firstName: "Staged",
			token: "tok1",
		});
		await backend.run((context) =>
			context.db.patch(id, { tier: "member", stage: "active" })
		);
		const before = await backend.run((context) => context.db.get(id));
		const result = await backend.mutation(
			internal.applications.confirmApplicationByToken,
			{ token: "tok1" }
		);
		expect(result.status).toBe("invalid");
		expect(await backend.run((context) => context.db.get(id))).toEqual(
			before
		);
		expect(
			await backend.run((context) =>
				context.db.query("personEvents").collect()
			)
		).toHaveLength(0);
	});

	it("an own unverified row is still overwritten at re-submit", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run((context) =>
			context.db.insert("people", { ...seed, firstName: "Draft" })
		);
		await backend.mutation(internal.applications.insertApplication, {
			...VALID_INPUT,
			firstName: "Final",
			token: "tok1",
		});
		expect(
			(await backend.run((context) => context.db.get(id)))!.firstName
		).toBe("Final");
	});

	it("submitApplication answers pending for every outcome", async () => {
		const backend = convexTest(schema, modules);
		registerRateLimiter(backend);
		vi.stubEnv("RECAPTCHA_SECRET", "s");
		stubRecaptcha({ success: true, action: "signup", score: 0.9 });
		await backend.run((context) =>
			context.db.insert("people", {
				...seed,
				email: "member@example.com",
				tier: "member",
				stage: "active",
				verifiedAt: 1,
			})
		);
		const result = await backend.action(
			api.applications.submitApplication,
			{
				...VALID_INPUT,
				email: "member@example.com",
				token: "captcha",
			}
		);
		expect(result).toEqual({ status: "pending" });
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("a migrated application token carrying an event records attendance on confirm, unless the event is over", async () => {
		const backend = convexTest(schema, modules);
		const liveEvent = await seedEvent(backend);
		const endedEvent = await backend.run(async (context) =>
			context.db.insert("events", {
				name: "Past",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "1970-01-01T01:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "1970-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: (await context.db.get(liveEvent))!.createdBy,
				createdAt: 0,
			})
		);
		async function confirmWith(email: string, eventId: typeof liveEvent) {
			const id = await backend.run((context) =>
				context.db.insert("people", { ...seed, email })
			);
			const tokenHash = await hashConfirmToken(`tok-${email}`);
			await backend.run((context) =>
				context.db.insert("confirmTokens", {
					tokenHash,
					purpose: "application",
					personId: id,
					eventId,
					expiresAt: Date.now() + 60_000,
				})
			);
			const result = await backend.mutation(
				internal.applications.confirmApplicationByToken,
				{ token: `tok-${email}` }
			);
			expect(result.status).toBe("verified");
			return backend.run((context) =>
				context.db
					.query("eventAttendance")
					.withIndex("by_person", (range) => range.eq("personId", id))
					.collect()
			);
		}
		const live = await confirmWith("live@example.com", liveEvent);
		expect(live.map((attendance) => attendance.eventId)).toEqual([
			liveEvent,
		]);
		expect(await confirmWith("late@example.com", endedEvent)).toHaveLength(
			0
		);
	});

	it("confirm says already on a second click and expired after the TTL", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedUnverified(backend);
		await backend.run((context) =>
			issueToken(context, {
				token: "t1",
				purpose: "application",
				personId: id,
				ttlMs: 1000,
			})
		);
		async function confirmStatus(token: string) {
			const confirmed = await backend.mutation(
				internal.applications.confirmApplicationByToken,
				{ token }
			);
			return confirmed.status;
		}
		expect(await confirmStatus("t1")).toBe("verified");
		expect(await confirmStatus("t1")).toBe("already");
		await backend.run((context) =>
			issueToken(context, {
				token: "t2",
				purpose: "application",
				personId: id,
				ttlMs: -1,
			})
		);
		expect(await confirmStatus("t2")).toBe("expired");
		expect(await confirmStatus("zz")).toBe("invalid");
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("verified");
	});
});

async function seedApprovalPerson(
	backend: ReturnType<typeof convexTest>,
	tier: "guest" | "member"
) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier,
			stage: "onboarding",
			stageSince: Date.now(),
			...(tier === "guest"
				? {
						accessFrom: Date.now(),
						accessUntil: Date.now() + 86_400_000,
					}
				: {}),
		})
	);
}

// Pins Task 16 Step 6b: `sendApprovalEmail` used to read `person.type`, which
// is "applicant" for every fresh sign-up, so from this commit until Task 24
// every approved guest got the MEMBER email unless the tier branch was fixed.
// convex-test never runs a scheduled action on its own (see the
// `_scheduled_functions` note above), so the only way to prove the branch
// itself — not just that SOMETHING got scheduled — is to invoke the action
// body directly and read its devLog fallback (no RESEND_API_KEY in tests).
describe("sendApprovalEmail (tier branching)", () => {
	it("sends the guest variant for a guest-tier person", async () => {
		const backend = convexTest(schema, modules);
		await seedApprovalPerson(backend, "guest");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend.action(internal.notifications.sendApprovalEmail, {
			email: "ada@example.com",
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.some((message) => message.includes("[approval-guest]"))
		).toBe(true);
		expect(
			logs.some((message) => message.includes("[approval-member]"))
		).toBe(false);
	});

	it("sends the member variant for a member-tier person", async () => {
		const backend = convexTest(schema, modules);
		await seedApprovalPerson(backend, "member");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend.action(internal.notifications.sendApprovalEmail, {
			email: "ada@example.com",
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.some((message) => message.includes("[approval-member]"))
		).toBe(true);
		expect(
			logs.some((message) => message.includes("[approval-guest]"))
		).toBe(false);
	});

	it("sends nothing for a board-tier person", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await backend.action(internal.notifications.sendApprovalEmail, {
			email: "boss@example.com",
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.some((message) => message.includes("[approval-guest]"))
		).toBe(false);
		expect(
			logs.some((message) => message.includes("[approval-member]"))
		).toBe(false);
	});
});

async function seedProspect(backend: ReturnType<typeof convexTest>) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "prospect",
			stage: "verified",
			stageSince: Date.now(),
			vertical: ["ai", "healthtech"],
			venture: { name: "Engine Co" },
			board: { notes: "Promising" },
		})
	);
}

async function fieldEdits(backend: TestConvex<typeof schema>, id: string) {
	const rows = await backend.run(async (context) =>
		context.db
			.query("personEvents")
			.withIndex("by_person", (range) =>
				range.eq("personId", id as never)
			)
			.collect()
	);
	return rows.filter((row) => row.kind === "field_edit");
}

async function emailChangeTokens(backend: TestConvex<typeof schema>) {
	return backend.run(async (context) => {
		const tokens = await context.db.query("confirmTokens").collect();
		return tokens.filter((row) => row.purpose === "emailChange");
	});
}

// Pins Task 16's `people.update` — the single board field editor that replaced
// `applications.update` (venture/notes fields) alongside the profile fields.
describe("people.update", () => {
	it("logs a top-level field edit with its before and after value", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.update, { id, firstName: "Augusta" });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.firstName).toBe("Augusta");
		const edits = await fieldEdits(backend, id);
		expect(edits).toMatchObject([
			{ field: "firstName", before: "Ada", after: "Augusta" },
		]);
	});

	it("logs a venture.* field edit under its dotted name", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.update, {
			id,
			ventureName: "Analytical Engines Inc",
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.venture?.name).toBe("Analytical Engines Inc");
		const edits = await fieldEdits(backend, id);
		expect(edits).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: "venture.name",
					before: "Engine Co",
					after: "Analytical Engines Inc",
				}),
			])
		);
	});

	it("addNote appends an attributed note to the thread, crediting the actor", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.addNote, {
			id,
			text: "Even more promising",
		});

		const person = await backend.run(async (context) => context.db.get(id));
		const log = person?.board?.noteLog ?? [];
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ text: "Even more promising" });
		// The acting board member is attached automatically — no manual "[name]:".
		expect(log[0].authorId).toBeDefined();
	});

	it("addNote ignores a blank note rather than storing it", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.addNote, { id, text: "   " });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.board?.noteLog ?? []).toHaveLength(0);
	});

	it("does not record a spurious edit when the value is unchanged", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.update, { id, firstName: "Ada" });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.firstName).toBe("Ada");
		expect(await fieldEdits(backend, id)).toHaveLength(0);
	});

	it("does not record a spurious edit when re-saving the same verticals (array field)", async () => {
		// `logFieldEdit` compares with `===`; a fresh array of the exact same
		// values is never `===` the stored one, so without a shallow compare in
		// `update` this would log a `field_edit` row on every save that leaves
		// the board's vertical selection untouched.
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await asBoard.mutation(api.people.update, {
			id,
			vertical: ["ai", "healthtech"],
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.vertical).toEqual(["ai", "healthtech"]);
		expect(await fieldEdits(backend, id)).toHaveLength(0);
	});

	it("rejects an email edit that collides with another person's email", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "grace@example.com",
				firstName: "Grace",
				lastName: "Hopper",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);

		// A ConvexError, so the message survives production's redaction.
		const refusal: unknown = await asBoard
			.mutation(api.people.update, { id, email: "Grace@Example.com" })
			.catch((err: unknown) => err);
		expect(refusal).toBeInstanceOf(ConvexError);
		expect((refusal as ConvexError<string>).data).toBe(EMAIL_IN_USE);

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
	});

	it("rejects an empty or malformed email, keeping the old one", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		for (const email of ["", "  ", "ada@example", "ada example.com"]) {
			const refusal: unknown = await asBoard
				.mutation(api.people.update, { id, email })
				.catch((err: unknown) => err);
			expect(refusal).toBeInstanceOf(ConvexError);
			expect((refusal as ConvexError<string>).data).toBe(EMAIL_INVALID);
		}

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
	});

	it("re-saves a row whose stored email is legacy garbage when the email is unchanged", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);
		const legacy = "undefined / pwnkit labs / dreamlabs";
		await backend.run(async (context) =>
			context.db.patch(id, { email: legacy })
		);

		await asBoard.mutation(api.people.update, {
			id,
			email: legacy,
			firstName: "Augusta",
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe(legacy);
		expect(person?.firstName).toBe("Augusta");

		// A CHANGED malformed email is still refused.
		const refusal: unknown = await asBoard
			.mutation(api.people.update, { id, email: "still garbage" })
			.catch((err: unknown) => err);
		expect((refusal as ConvexError<string>).data).toBe(EMAIL_INVALID);
	});

	it("re-saves a legacy capitalized garbage email without validating or rewriting it", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);
		const legacy = "Undefined / Pwnkit Labs";
		await backend.run(async (context) =>
			context.db.patch(id, { email: legacy })
		);

		await asBoard.mutation(api.people.update, {
			id,
			email: legacy,
			firstName: "Augusta",
		});

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe(legacy);
		expect(person?.firstName).toBe("Augusta");
	});

	it("an email edit is not applied: it mails a confirm link to the new address, lowercased", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard, boardId } = await seedBoard(backend);
		const id = await seedProspect(backend);

		let result: unknown;
		const logs = await runAndCollectLogs(backend, async () => {
			result = await asBoard.mutation(api.people.update, {
				id,
				email: " Ada@Example.ORG ",
			});
		});

		expect(result).toEqual({ emailChange: "pending" });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
		expect(await fieldEdits(backend, id)).toHaveLength(0);

		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "people:sendEmailChangeLink",
					args: [
						{
							personId: id,
							newEmail: "ada@example.org",
							actorId: boardId,
						},
					],
				}),
			])
		);
		const tokens = await emailChangeTokens(backend);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			personId: id,
			newEmail: "ada@example.org",
			actorId: boardId,
		});
		// The link mailed to the new address carries the raw token of that row.
		const linked = logs
			.map((line) =>
				/^\[email-change\] ada@example\.org \S*\/email\/confirm\?token=([0-9a-f]{64})$/.exec(
					line
				)
			)
			.find((match) => match)?.[1];
		expect(linked).toBeDefined();
		expect(tokens[0].tokenHash).toBe(await hashConfirmToken(linked ?? ""));
	});

	it("applies the other fields of an update that also changes the email", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.people.update, {
				id,
				email: "augusta@example.com",
				firstName: "Augusta",
			})
		);

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.firstName).toBe("Augusta");
		expect(person?.email).toBe("ada@example.com");
	});

	it("returns null when the email is not changed", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		const result = await asBoard.mutation(api.people.update, {
			id,
			email: "ADA@example.com",
			firstName: "Augusta",
		});

		expect(result).toBeNull();
		expect(await emailChangeTokens(backend)).toHaveLength(0);
	});

	it("the emailed link moves the person to the new address", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedProspect(backend);

		const logs = await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.people.update, {
				id,
				email: "ada@example.org",
			})
		);
		const token = logs
			.map((line) => /\/email\/confirm\?token=([0-9a-f]{64})/.exec(line))
			.find((match) => match)?.[1];
		expect(token).toBeDefined();

		const result = await backend.mutation(api.people.confirmEmailChange, {
			token: token ?? "",
		});

		expect(result).toEqual({ status: "verified" });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.org");
	});
});

describe("people.confirmEmailChange", () => {
	const RAW = "e".repeat(64);
	const ONE_HOUR = 60 * 60 * 1000;

	async function seedPending(
		backend: ReturnType<typeof convexTest>,
		ttlMs = ONE_HOUR,
		actorId?: Id<"people">
	) {
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: RAW,
				purpose: "emailChange",
				personId: id,
				ttlMs,
				newEmail: "ada@example.org",
				actorId,
			})
		);
		return id;
	}

	it("patches the email, logs it with the requesting board member, and tells the old address", async () => {
		const backend = convexTest(schema, modules);
		const { boardId } = await seedBoard(backend);
		const id = await seedPending(backend, ONE_HOUR, boardId);

		let result: unknown;
		const logs = await runAndCollectLogs(backend, async () => {
			result = await backend.mutation(api.people.confirmEmailChange, {
				token: RAW,
			});
		});

		expect(result).toEqual({ status: "verified" });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.org");
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual([
			expect.objectContaining({
				name: "people:sendEmailChangedNotice",
				args: [
					{
						oldEmail: "ada@example.com",
						newEmail: "ada@example.org",
					},
				],
			}),
		]);
		expect(logs).toContain(
			"[email-changed] ada@example.com -> ada@example.org"
		);
		const edits = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(edits).toEqual([
			expect.objectContaining({
				kind: "field_edit",
				field: "email",
				before: "ada@example.com",
				after: "ada@example.org",
				actorId: boardId,
			}),
		]);
	});

	it("answers taken and leaves the email when someone took the address since", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedPending(backend);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.org",
				firstName: "Other",
				lastName: "",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);

		const result = await backend.mutation(api.people.confirmEmailChange, {
			token: RAW,
		});

		expect(result).toEqual({ status: "taken" });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(0);
	});

	it("answers expired and leaves the email for a dead link", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedPending(backend, -1);

		const result = await backend.mutation(api.people.confirmEmailChange, {
			token: RAW,
		});

		expect(result).toEqual({ status: "expired" });
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
	});

	it("answers invalid for an unknown token or another purpose's token", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedPending(backend);
		await backend.run((context) =>
			issueToken(context, {
				token: "f".repeat(64),
				purpose: "application",
				personId: id,
				ttlMs: ONE_HOUR,
			})
		);

		for (const token of ["nope", "f".repeat(64)]) {
			expect(
				await backend.mutation(api.people.confirmEmailChange, { token })
			).toEqual({ status: "invalid" });
		}
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.email).toBe("ada@example.com");
	});

	it("a repeat click on a used link answers verified without mailing again", async () => {
		const backend = convexTest(schema, modules);
		await seedPending(backend);
		await runAndCollectLogs(backend, () =>
			backend.mutation(api.people.confirmEmailChange, { token: RAW })
		);

		const result = await backend.mutation(api.people.confirmEmailChange, {
			token: RAW,
		});

		expect(result).toEqual({ status: "verified" });
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(1);
	});
});

async function seedEmailChangePerson(backend: ReturnType<typeof convexTest>) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

function linkIn(logs: string[], address: string): string {
	const token = logs
		.filter((line) => line.startsWith(`[email-change] ${address} `))
		.map((line) => /\/email\/confirm\?token=([0-9a-f]{64})/.exec(line))
		.find((match) => match)?.[1];
	if (!token) throw new Error(`no confirm link mailed to ${address}`);
	return token;
}

async function storedEmail(
	backend: TestConvex<typeof schema>,
	id: Id<"people">
): Promise<string | undefined> {
	const person = await backend.run(async (context) => context.db.get(id));
	return person?.email;
}

async function requestChange(
	backend: ReturnType<typeof convexTest>,
	asBoard: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
	id: Id<"people">,
	email: string
) {
	const logs = await runAndCollectLogs(backend, () =>
		asBoard.mutation(api.people.update, { id, email })
	);
	return linkIn(logs, email);
}

describe("pending email changes", () => {
	const MEMBER_EMAIL = "mia@example.com";

	async function seedMember(backend: ReturnType<typeof convexTest>) {
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: MEMBER_EMAIL,
				firstName: "Mia",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		return backend.withIdentity({ email: MEMBER_EMAIL });
	}

	it("shows the board the address a change waits on, and nothing once there is none", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedEmailChangePerson(backend);

		expect(
			await asBoard.query(api.people.pendingEmailChange, { personId: id })
		).toBeNull();
		await requestChange(backend, asBoard, id, "ada@example.org");
		expect(
			await asBoard.query(api.people.pendingEmailChange, { personId: id })
		).toEqual({ newEmail: "ada@example.org" });
	});

	it("hides a pending change from a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const asMember = await seedMember(backend);
		const id = await seedEmailChangePerson(backend);
		await requestChange(backend, asBoard, id, "ada@example.org");

		await expect(
			asMember.query(api.people.pendingEmailChange, { personId: id })
		).rejects.toThrow("Forbidden");
	});

	it("cancel kills the mailed link: it answers invalid and the email stays", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedEmailChangePerson(backend);
		const token = await requestChange(
			backend,
			asBoard,
			id,
			"ada@example.org"
		);

		await asBoard.mutation(api.people.cancelEmailChange, { personId: id });

		expect(
			await asBoard.query(api.people.pendingEmailChange, { personId: id })
		).toBeNull();
		expect(
			await backend.mutation(api.people.confirmEmailChange, { token })
		).toEqual({ status: "invalid" });
		expect(await storedEmail(backend, id)).toBe("ada@example.com");
	});

	it("refuses cancel to a non-board caller and leaves the link live", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const asMember = await seedMember(backend);
		const id = await seedEmailChangePerson(backend);
		const token = await requestChange(
			backend,
			asBoard,
			id,
			"ada@example.org"
		);

		await expect(
			asMember.mutation(api.people.cancelEmailChange, { personId: id })
		).rejects.toThrow("Forbidden");

		expect(
			await backend.mutation(api.people.confirmEmailChange, { token })
		).toEqual({ status: "verified" });
	});

	it("a new email change revokes the earlier pending one", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedEmailChangePerson(backend);
		const first = await requestChange(
			backend,
			asBoard,
			id,
			"typo@example.com"
		);
		const second = await requestChange(
			backend,
			asBoard,
			id,
			"ada@example.org"
		);

		expect(
			await backend.mutation(api.people.confirmEmailChange, {
				token: first,
			})
		).toEqual({ status: "invalid" });
		expect(
			await asBoard.query(api.people.pendingEmailChange, { personId: id })
		).toEqual({ newEmail: "ada@example.org" });
		expect(
			await backend.mutation(api.people.confirmEmailChange, {
				token: second,
			})
		).toEqual({ status: "verified" });
	});

	it("re-entering the stored email revokes the pending change without mailing anyone", async () => {
		const backend = convexTest(schema, modules);
		const { asBoard } = await seedBoard(backend);
		const id = await seedEmailChangePerson(backend);
		const token = await requestChange(
			backend,
			asBoard,
			id,
			"typo@example.com"
		);
		const jobsBefore = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);

		const result = await asBoard.mutation(api.people.update, {
			id,
			email: "ada@example.com",
		});

		expect(result).toBeNull();
		const jobsAfter = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobsAfter).toHaveLength(jobsBefore.length);
		expect(
			await backend.mutation(api.people.confirmEmailChange, { token })
		).toEqual({ status: "invalid" });
		expect(await storedEmail(backend, id)).toBe("ada@example.com");
	});

	it("refuses a non-board email change: no token, no mail", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		const id = await seedEmailChangePerson(backend);

		await expect(
			asMember.mutation(api.people.update, {
				id,
				email: "ada@example.org",
			})
		).rejects.toThrow("Forbidden");

		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(0);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(0);
		expect(await storedEmail(backend, id)).toBe("ada@example.com");
	});
});
