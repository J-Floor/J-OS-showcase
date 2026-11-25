import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schedule } from "./schedule.ts";

const api = vi.hoisted(() => ({
	fetchSchedule:
		vi.fn<
			(
				token: string,
				signal?: AbortSignal
			) => Promise<
				| { xml: string; version: number | undefined }
				| "unauthorized"
				| "missing"
			>
		>(),
}));
vi.mock("./api.ts", () => api);

const { createScheduleSync } = await import("./scheduleSync.ts");
const { storage } = await import("./storage.ts");

const MINUTE = 60_000;
const XML = '<schedule><day name="mon" on="08:00" off="18:00"/></schedule>';
const XML_2 = '<schedule><day name="tue" off="all"/></schedule>';
const stop = new AbortController().signal;

let clock: number;
const onSchedule = vi.fn();

function make() {
	return createScheduleSync({ onSchedule, now: () => clock });
}

beforeEach(() => {
	clock = 1_000_000;
	localStorage.clear();
});

afterEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
});

describe("createScheduleSync", () => {
	it("reports a stored schedule on start", () => {
		storage.setSchedule(XML);
		make();
		expect(onSchedule).toHaveBeenCalledTimes(1);
		const schedule = onSchedule.mock.calls[0]?.[0] as Schedule | undefined;
		expect(schedule?.[1]).toEqual({
			closed: false,
			onMinute: 480,
			offMinute: 1080,
		});
		expect(api.fetchSchedule).not.toHaveBeenCalled();
	});

	it("survives a throwing onSchedule at start, on a change and on a clear", async () => {
		onSchedule.mockImplementation(() => {
			throw new Error("controller broke");
		});
		storage.setSchedule(XML);
		const sync = make();
		api.fetchSchedule.mockResolvedValueOnce({ xml: XML_2, version: 2 });
		await expect(sync.onManifest(2, "tok", stop)).resolves.toBe(true);
		expect(storage.getSchedule()).toBe(XML_2);
		await expect(sync.onManifest(null, "tok", stop)).resolves.toBe(true);
		expect(storage.getSchedule()).toBeNull();
		expect(onSchedule).toHaveBeenCalledTimes(3);
		// Applied, not a recorded failure: the same version is not refetched.
		api.fetchSchedule.mockClear();
		await sync.onManifest(null, "tok", stop);
		expect(api.fetchSchedule).not.toHaveBeenCalled();
	});

	it("reports nothing on start without a stored schedule", () => {
		make();
		expect(onSchedule).not.toHaveBeenCalled();
	});

	it("fetches once per version, stores the XML and reports it", async () => {
		api.fetchSchedule.mockResolvedValue({ xml: XML, version: 5 });
		const sync = make();
		expect(await sync.onManifest(5, "tok", stop)).toBe(true);
		expect(await sync.onManifest(5, "tok", stop)).toBe(true);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(1);
		expect(api.fetchSchedule).toHaveBeenCalledWith("tok", stop);
		expect(storage.getSchedule()).toBe(XML);
		expect(onSchedule).toHaveBeenCalledTimes(1);
	});

	it("fetches again when the version changes", async () => {
		api.fetchSchedule.mockResolvedValueOnce({ xml: XML, version: 5 });
		api.fetchSchedule.mockResolvedValueOnce({ xml: XML_2, version: 6 });
		const sync = make();
		await sync.onManifest(5, "tok", stop);
		await sync.onManifest(6, "tok", stop);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(2);
		expect(storage.getSchedule()).toBe(XML_2);
	});

	it("clears the schedule on null without fetching", async () => {
		storage.setSchedule(XML);
		const sync = make();
		onSchedule.mockClear();
		expect(await sync.onManifest(null, "tok", stop)).toBe(true);
		expect(storage.getSchedule()).toBeNull();
		expect(onSchedule).toHaveBeenCalledWith(undefined);
		expect(api.fetchSchedule).not.toHaveBeenCalled();
	});

	it("does nothing for an older backend (undefined)", async () => {
		storage.setSchedule(XML);
		const sync = make();
		onSchedule.mockClear();
		expect(await sync.onManifest(undefined, "tok", stop)).toBe(true);
		expect(storage.getSchedule()).toBe(XML);
		expect(onSchedule).not.toHaveBeenCalled();
		expect(api.fetchSchedule).not.toHaveBeenCalled();
	});

	it("keeps the last good schedule and backs off 5, 10, ... 60 minutes on failures", async () => {
		api.fetchSchedule.mockResolvedValueOnce({ xml: XML, version: 5 });
		const sync = make();
		await sync.onManifest(5, "tok", stop);
		onSchedule.mockClear();
		api.fetchSchedule.mockRejectedValue(new Error("down"));
		const waits = [5, 10, 20, 40, 60, 60];
		let calls = 1;
		for (const minutes of waits) {
			await sync.onManifest(6, "tok", stop);
			calls += 1;
			expect(api.fetchSchedule).toHaveBeenCalledTimes(calls);
			clock += minutes * MINUTE - 1;
			await sync.onManifest(6, "tok", stop);
			expect(api.fetchSchedule).toHaveBeenCalledTimes(calls);
			clock += 1;
		}
		expect(storage.getSchedule()).toBe(XML);
		expect(onSchedule).not.toHaveBeenCalled();
	});

	it("treats unparseable XML like a failure and keeps the last schedule", async () => {
		storage.setSchedule(XML);
		const sync = make();
		onSchedule.mockClear();
		api.fetchSchedule.mockResolvedValue({ xml: "<nope", version: 7 });
		await sync.onManifest(7, "tok", stop);
		await sync.onManifest(7, "tok", stop);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(1);
		expect(storage.getSchedule()).toBe(XML);
		expect(onSchedule).not.toHaveBeenCalled();
		clock += 5 * MINUTE;
		await sync.onManifest(7, "tok", stop);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(2);
	});

	it("a new version is not held back by an old failure", async () => {
		api.fetchSchedule.mockRejectedValueOnce(new Error("down"));
		api.fetchSchedule.mockResolvedValueOnce({ xml: XML, version: 8 });
		const sync = make();
		await sync.onManifest(7, "tok", stop);
		await sync.onManifest(8, "tok", stop);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(2);
		expect(storage.getSchedule()).toBe(XML);
	});

	it("retries when the clock went back past the maximum wait", async () => {
		api.fetchSchedule.mockRejectedValue(new Error("down"));
		const sync = make();
		await sync.onManifest(7, "tok", stop);
		clock -= 2 * 60 * MINUTE;
		await sync.onManifest(7, "tok", stop);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(2);
	});

	it("resolves false on unauthorized", async () => {
		api.fetchSchedule.mockResolvedValue("unauthorized");
		expect(await make().onManifest(5, "tok", stop)).toBe(false);
	});

	it("clears the schedule when the server says it is missing", async () => {
		storage.setSchedule(XML);
		api.fetchSchedule.mockResolvedValue("missing");
		const sync = make();
		onSchedule.mockClear();
		expect(await sync.onManifest(5, "tok", stop)).toBe(true);
		expect(storage.getSchedule()).toBeNull();
		expect(onSchedule).toHaveBeenCalledWith(undefined);
	});
});
