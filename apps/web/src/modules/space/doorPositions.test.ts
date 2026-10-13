// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const { positionAsync } = vi.hoisted(() => ({ positionAsync: vi.fn() }));

vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync: positionAsync }),
}));

import { type DoorPosition } from "../../../convex/lib/doorProvider.ts";

import { createDoorPositions } from "./doorPositions.ts";

afterEach(() => {
	positionAsync.mockReset();
});

function pending() {
	const read: { resolve: (v: DoorPosition) => void } = { resolve() {} };
	positionAsync.mockReturnValueOnce(
		new Promise<DoorPosition>((resolve) => {
			read.resolve = resolve;
		})
	);
	return read;
}

test("a read still out when enabled turns false cannot land after re-enable", async () => {
	const [enabled, setEnabled] = createSignal(true);
	const old = pending();
	const { doors, dispose } = createRoot((dispose) => ({
		doors: createDoorPositions({ enabled, hasStatus: () => false }),
		dispose,
	}));
	expect(positionAsync).toHaveBeenCalledWith({
		lock: "upstairs",
		fresh: true,
	});
	try {
		setEnabled(false);
		expect(doors.isChecking("upstairs")).toBe(false);
		old.resolve("unlocked");
		await Promise.resolve();
		await Promise.resolve();
		expect(doors.position("upstairs")).toBeUndefined();
		pending();
		setEnabled(true);
		expect(doors.position("upstairs")).toBeUndefined();
	} finally {
		dispose();
	}
});

test("a re-check waiting out the 5s fires nothing once disabled", async () => {
	vi.useFakeTimers();
	try {
		const [enabled, setEnabled] = createSignal(true);
		positionAsync.mockResolvedValue("locked");
		const { doors, dispose } = createRoot((dispose) => ({
			doors: createDoorPositions({ enabled, hasStatus: () => false }),
			dispose,
		}));
		try {
			await vi.advanceTimersByTimeAsync(0);
			doors.recheck("upstairs");
			expect(doors.isChecking("upstairs")).toBe(true);
			setEnabled(false);
			positionAsync.mockClear();
			vi.advanceTimersByTime(10_000);
			expect(positionAsync).not.toHaveBeenCalled();
			expect(doors.isChecking("upstairs")).toBe(false);
		} finally {
			dispose();
		}
	} finally {
		vi.useRealTimers();
	}
});

test("an enabled accessor that re-runs with the same value does not re-read", () => {
	const [tick, setTick] = createSignal(0);
	positionAsync.mockResolvedValue("locked");
	const dispose = createRoot((dispose) => {
		createDoorPositions({
			enabled: () => tick() >= 0,
			hasStatus: () => false,
		});
		return dispose;
	});
	const calls = positionAsync.mock.calls.length;
	expect(calls).toBeGreaterThan(0);
	setTick(1);
	expect(positionAsync.mock.calls.length).toBe(calls);
	dispose();
});
