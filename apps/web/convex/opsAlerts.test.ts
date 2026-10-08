import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { RENAG_MS } from "./opsAlerts.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const KEY = "door";
const T0 = 1_800_000_000_000;

function claim(
	t: ReturnType<typeof convexTest>,
	fingerprint: string,
	now: number
) {
	return t.mutation(internal.opsAlerts.claim, { key: KEY, fingerprint, now });
}

describe("opsAlerts.claim", () => {
	it("reports a fault the first time it is seen", async () => {
		const t = convexTest(schema, modules);
		expect(await claim(t, "locks:2", T0)).toBe("changed");
	});

	it("says nothing at all when the first sweep is healthy", async () => {
		// An all-clear for a fault that never happened is noise, and it would
		// teach the board to ignore the channel before it ever carried anything.
		const t = convexTest(schema, modules);
		expect(await claim(t, "", T0)).toBe("silent");
	});

	it("stays quiet while the same fault persists inside the window", async () => {
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		expect(await claim(t, "locks:2", T0 + RENAG_MS - 1)).toBe("silent");
	});

	it("re-nags once the window has passed, then goes quiet again", async () => {
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		expect(await claim(t, "locks:2", T0 + RENAG_MS)).toBe("renag");
		// The re-nag restarts the clock — otherwise every sweep after the first
		// week is a fresh email, which is the nightly spam this exists to avoid.
		expect(await claim(t, "locks:2", T0 + RENAG_MS + 1)).toBe("silent");
	});

	it("reports immediately when what is wrong changes", async () => {
		// A second lock going down is new information and must not wait a week.
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		expect(await claim(t, "locks:1,2", T0 + 1000)).toBe("changed");
	});

	it("announces the all-clear exactly once", async () => {
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		expect(await claim(t, "", T0 + 1000)).toBe("resolved");
		expect(await claim(t, "", T0 + 2000)).toBe("silent");
	});

	it("treats a fresh outage after an all-clear as new, not as a repeat", async () => {
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		await claim(t, "", T0 + 1000);
		expect(await claim(t, "locks:2", T0 + 2000)).toBe("changed");
	});
});

describe("opsAlerts.release", () => {
	it("lets the very next sweep re-alert when the email never went out", async () => {
		// The claim is recorded before the mail leaves. Without release, a mail
		// outage buys a week of silence on the strength of a message nobody
		// received — the exact failure this whole path exists to end.
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		expect(await claim(t, "locks:2", T0 + 1000)).toBe("silent");
		await t.mutation(internal.opsAlerts.release, { key: KEY });
		expect(await claim(t, "locks:2", T0 + 2000)).toBe("renag");
	});

	it("leaves a newer claim alone when the fingerprint no longer matches", async () => {
		const t = convexTest(schema, modules);
		await claim(t, "locks:2", T0);
		await claim(t, "locks:1,2", T0 + 1000);
		await t.mutation(internal.opsAlerts.release, {
			key: KEY,
			fingerprint: "locks:2",
		});
		expect(await claim(t, "locks:1,2", T0 + 2000)).toBe("silent");
		await t.mutation(internal.opsAlerts.release, {
			key: KEY,
			fingerprint: "locks:1,2",
		});
		expect(await claim(t, "locks:1,2", T0 + 3000)).toBe("renag");
	});

	it("does not invent a fault when nothing was ever claimed", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.opsAlerts.release, { key: KEY });
		expect(await claim(t, "", T0)).toBe("silent");
	});
});
