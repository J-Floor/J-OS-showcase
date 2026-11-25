import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createPowerController } from "./powerController.ts";
import type { Schedule } from "./schedule.ts";

// Local time (TZ is pinned to Europe/Berlin under vitest). 2030-01-06 is a Sunday.
function SUNDAY(hour: number, minute = 0): Date {
	return new Date(2030, 0, 6, hour, minute);
}

// On every day from 08:00 to 20:00.
const DAY = { closed: false, onMinute: 8 * 60, offMinute: 20 * 60 };
const schedule: Schedule = Array.from({ length: 7 }, () => DAY);

let clock = SUNDAY(12);
function now(): Date {
	return clock;
}

function backend() {
	return { screenOff: vi.fn(), screenOn: vi.fn() };
}

beforeEach(() => {
	vi.useFakeTimers();
	clock = SUNDAY(12);
});
afterEach(() => vi.useRealTimers());

it("turns the screen on and arms no timer without a schedule", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(undefined);
	expect(power.screenOn).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
	controller.stop();
});

it("turns the screen off at once when the schedule is off now", () => {
	clock = SUNDAY(22);
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	expect(power.screenOff).toHaveBeenCalledTimes(1);
	expect(power.screenOn).not.toHaveBeenCalled();
	controller.stop();
});

it("flips at the next change and does not repeat unchanged state", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	expect(power.screenOn).toHaveBeenCalledTimes(1);
	clock = SUNDAY(20);
	vi.advanceTimersByTime(8 * 3600_000);
	expect(power.screenOff).toHaveBeenCalledTimes(1);
	controller.setSchedule(schedule);
	expect(power.screenOff).toHaveBeenCalledTimes(1);
	controller.stop();
});

it("re-arms on a new schedule and clears the old timer", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	expect(vi.getTimerCount()).toBe(1);
	controller.setSchedule(schedule);
	expect(vi.getTimerCount()).toBe(1);
	controller.setSchedule(undefined);
	expect(vi.getTimerCount()).toBe(0);
	controller.stop();
});

it("stop clears the timer and leaves the screen on", () => {
	clock = SUNDAY(22);
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	controller.stop();
	expect(vi.getTimerCount()).toBe(0);
	expect(power.screenOn).toHaveBeenCalled();
	document.dispatchEvent(new Event("visibilitychange"));
	expect(power.screenOff).toHaveBeenCalledTimes(1);
});

it("swallows a throwing backend and stays alive", () => {
	const power = {
		screenOff: vi.fn(() => {
			throw new Error("boom");
		}),
		screenOn: vi.fn(() => {
			throw new Error("boom");
		}),
	};
	const controller = createPowerController(power, now);
	expect(() => {
		controller.setSchedule(schedule);
	}).not.toThrow();
	expect(vi.getTimerCount()).toBe(1);
	controller.stop();
});

it("re-evaluates on visibilitychange", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	clock = SUNDAY(23);
	document.dispatchEvent(new Event("visibilitychange"));
	expect(power.screenOff).toHaveBeenCalledTimes(1);
	controller.stop();
});

it("re-evaluates and re-arms when the timer fires early", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	vi.advanceTimersByTime(9 * 3600_000);
	expect(power.screenOff).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(1);
	controller.stop();
});

it("clamps a long delay to 24 hours", () => {
	const spy = vi.spyOn(globalThis, "setTimeout");
	// Closed Monday to Saturday: the next change after Sunday evening is days away.
	const sparse: Schedule = [
		DAY,
		...Array.from({ length: 6 }, () => ({ closed: true })),
	];
	clock = SUNDAY(21);
	const controller = createPowerController(backend(), now);
	controller.setSchedule(sparse);
	const delays = spy.mock.calls.map((call) => call[1]!);
	expect(Math.max(...delays)).toBeLessThanOrEqual(24 * 3600_000);
	controller.stop();
	spy.mockRestore();
});

it("floors the delay at 1 second when the next change is closer", () => {
	const spy = vi.spyOn(globalThis, "setTimeout");
	clock = new Date(2030, 0, 6, 19, 59, 59, 990);
	const controller = createPowerController(backend(), now);
	controller.setSchedule(schedule);
	expect(spy.mock.calls.map((call) => call[1])).toEqual([1000]);
	controller.stop();
	spy.mockRestore();
});

it("refresh re-evaluates after the clock moves without a timer firing", () => {
	const power = backend();
	const controller = createPowerController(power, now);
	controller.setSchedule(schedule);
	expect(power.screenOn).toHaveBeenCalledTimes(1);
	clock = SUNDAY(22);
	controller.refresh();
	expect(power.screenOff).toHaveBeenCalledTimes(1);
	clock = SUNDAY(9);
	controller.refresh();
	expect(power.screenOn).toHaveBeenCalledTimes(2);
	controller.stop();
});
