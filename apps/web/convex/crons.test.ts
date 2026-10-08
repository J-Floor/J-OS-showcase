import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import crons from "./crons.ts";

describe("crons", () => {
	it("registers the guest-window sweep at 01:15 UTC", () => {
		const job = crons.crons["expire guest windows missed by the scheduler"];
		expect(job).toBeDefined();
		expect(job.schedule).toEqual({
			type: "daily",
			hourUTC: 1,
			minuteUTC: 15,
		});
		expect(job.name).toBe(
			getFunctionName(internal.lifecycle.sweepExpiredWindows)
		);
	});

	it("registers the unverified-prospect purge at 01:30 UTC", () => {
		const job = crons.crons["purge unverified prospects"];
		expect(job).toBeDefined();
		expect(job.schedule).toEqual({
			type: "daily",
			hourUTC: 1,
			minuteUTC: 30,
		});
		expect(job.name).toBe(getFunctionName(internal.purge.purgeUnverified));
	});

	it("registers the notification history purge at 01:45 UTC", () => {
		const job =
			crons.crons["purge notification history older than 90 days"];
		expect(job).toBeDefined();
		expect(job.schedule).toEqual({
			type: "daily",
			hourUTC: 1,
			minuteUTC: 45,
		});
		expect(job.name).toBe(
			getFunctionName(internal.notify.inbox.purgeExpired)
		);
	});

	it("registers the lifecycle invariant check at 02:00 UTC", () => {
		const job = crons.crons["check lifecycle invariants"];
		expect(job).toBeDefined();
		expect(job.schedule).toEqual({
			type: "daily",
			hourUTC: 2,
			minuteUTC: 0,
		});
		expect(job.name).toBe(getFunctionName(internal.invariants.check));
	});

	it("registers exactly these jobs — the nightly door-key sweep is gone", () => {
		// Each test above looks a job up by name, so a stray registration
		// (e.g. the retired door-key sweep) would pass every one
		// without this.
		expect(Object.keys(crons.crons)).toHaveLength(7);
	});

	it("purges access logs older than 12 months nightly", () => {
		const doorLog = crons.crons["purge door log older than 12 months"];
		expect(doorLog.schedule).toEqual({
			type: "daily",
			hourUTC: 2,
			minuteUTC: 15,
		});
		expect(doorLog.name).toBe(
			getFunctionName(internal.accessLogRetention.purgeDoorLog)
		);
		const wifi =
			crons.crons["purge Wi-Fi open events older than 12 months"];
		expect(wifi.schedule).toEqual({
			type: "daily",
			hourUTC: 2,
			minuteUTC: 30,
		});
		expect(wifi.name).toBe(
			getFunctionName(internal.accessLogRetention.purgeWifiEvents)
		);
	});

	it("polls door lock status every 10 minutes", () => {
		const job = crons.crons["poll door lock status"];
		expect(job).toBeDefined();
		expect(job.schedule).toEqual({ type: "interval", minutes: 10 });
		expect(job.name).toBe(getFunctionName(internal.notify.doorPoll.poll));
	});
});
