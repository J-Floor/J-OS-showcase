// apps/web/convex/notifications.test.ts
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import {
	composeExpiry,
	formatDateOnlyLong,
	formatZoned,
	SITE_TIMEZONE,
	utcFromLocal,
} from "./lib/time.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function stubResend() {
	process.env.RESEND_API_KEY = "re_x";
	const fetchSpy = vi.fn<
		(url: string, init: { body: string }) => Promise<{ ok: boolean }>
	>(() => Promise.resolve({ ok: true }));
	vi.stubGlobal("fetch", fetchSpy);
	return fetchSpy;
}

describe("sendApprovalEmail (windowed guest)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RESEND_API_KEY;
	});

	it("renders untilDate as the CHOSEN day, not the exclusive-end instant", async () => {
		const t = convexTest(schema, modules);
		// The board picked 2026-10-18 in the guest dialog; end-of-day-inclusive
		// semantics put the instant at 00:00:01 Zurich of the day AFTER, i.e.
		// 2026-10-19. `accessUntilLocal` is that zoned wall-clock — but the
		// email must show the guest the day they actually chose (the 18th),
		// not the raw exclusive-end instant ("19 Oct 2026, 00:00 CEST" would
		// read as if access ran through the 19th).
		const zoned = composeExpiry("2026-10-18", SITE_TIMEZONE);
		if (!zoned)
			throw new Error("composeExpiry returned null for a valid date");

		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessFrom: Date.now(),
				accessUntil: zoned.utc,
				accessUntilLocal: zoned.local,
			})
		);

		const fetchSpy = stubResend();
		await t.action(internal.notifications.sendApprovalEmail, {
			email: "ada@example.com",
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			text?: string;
		};
		// Correct: the inclusive day the board actually chose.
		expect(formatDateOnlyLong(Date.UTC(2026, 9, 18))).toBe(
			"18 October 2026"
		);
		expect(body.text).toContain("18 October 2026");
		// Wrong (pre-fix behaviour): rendering the raw accessUntilLocal instant
		// verbatim shows the exclusive-end day (the 19th) with a time-of-day —
		// pin its absence so a regression back to `formatZoned(accessUntilLocal)`
		// fails this test.
		expect(body.text).not.toContain(formatZoned(zoned.local));
		expect(body.text).not.toContain("19 Oct 2026");
	});

	it("falls back to the epoch's own Zurich-zone day for a legacy row with no accessUntilLocal", async () => {
		const t = convexTest(schema, modules);
		// 2026-10-17T22:30:00Z is already 2026-10-18 in Zurich (CEST +2) — a
		// deliberate UTC/Zurich day-boundary straddle. The OLD code
		// (`formatEmailDate` = UTC day) would show "17 October 2026"; the fix's
		// `guestChosenIso` fallback (epoch's own SITE-zone day) must show the
		// 18th instead.
		const until = Date.UTC(2026, 9, 17, 22, 30, 0);

		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessFrom: Date.now(),
				accessUntil: until,
				// accessUntilLocal intentionally absent: rows written before Model B.
			})
		);

		const fetchSpy = stubResend();
		await t.action(internal.notifications.sendApprovalEmail, {
			email: "ada@example.com",
		});

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			text?: string;
		};
		// No accessUntilLocal: guestChosenIso falls back to the epoch's own
		// Zurich-zone day (no inverse) — this is no longer `formatEmailDate`
		// (UTC-day), it's the epoch's SITE-zone day.
		expect(body.text).toContain("18 October 2026");
	});

	it("shows a preserved ARBITRARY accessUntilLocal's own day (not a day early)", async () => {
		const t = convexTest(schema, modules);
		// A seed/legacy-style arbitrary instant (NOT 00:00:01 Zurich) — the
		// preserved-row shape `guestChosenIso` exists to fix: its own day, not
		// the day before.
		const local = "2026-10-18T14:37:22+02:00[Europe/Zurich]";
		// Derive the epoch the same way production does — `new Date(local)` is
		// NaN because the JS Date parser rejects the `[Europe/Zurich]` suffix,
		// which would store a garbage `accessUntil` and let this pass without
		// exercising the real epoch.
		const until = utcFromLocal(local);

		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "seed-guest@example.com",
				firstName: "Seed",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessFrom: Date.now(),
				accessUntil: until,
				accessUntilLocal: local,
			})
		);

		const fetchSpy = stubResend();
		await t.action(internal.notifications.sendApprovalEmail, {
			email: "seed-guest@example.com",
		});

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			text?: string;
		};
		expect(body.text).toContain("18 October 2026");
		// Not a day early (the bug): must not show the 17th.
		expect(body.text).not.toContain("17 October 2026");
	});

	it("still shows the CHOSEN (day-before) date for a 00:00:01 Model-B row", async () => {
		const t = convexTest(schema, modules);
		const zoned = composeExpiry("2026-10-18", SITE_TIMEZONE)!; // -> 19th 00:00:01 Zurich

		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "windowed-guest@example.com",
				firstName: "Windowed",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessFrom: Date.now(),
				accessUntil: zoned.utc,
				accessUntilLocal: zoned.local,
			})
		);

		const fetchSpy = stubResend();
		await t.action(internal.notifications.sendApprovalEmail, {
			email: "windowed-guest@example.com",
		});

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			text?: string;
		};
		expect(body.text).toContain("18 October 2026");
		expect(body.text).not.toContain("19 October 2026");
	});
});
