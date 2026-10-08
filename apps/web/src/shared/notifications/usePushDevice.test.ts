import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const { push } = vi.hoisted(() => {
	const state = {
		support: "default",
		subscribed: false,
		configured: true,
		enable: vi.fn(() => Promise.resolve("granted")),
		disable: vi.fn(() => Promise.resolve()),
		read: vi.fn(() => Promise.resolve(state.subscribed)),
	};
	return { push: state };
});

vi.mock("../../lib/push.ts", () => ({
	isServiceWorkerNotReady: (err: unknown) =>
		err instanceof Error && err.message.includes("not ready"),
	pushConfigured: () => push.configured,
	pushSupport: () => push.support,
	pushSubscribed: push.read,
	enablePush: push.enable,
	disablePush: push.disable,
}));

import { usePushDevice, type PushDevice } from "./usePushDevice.ts";

let dispose: (() => void) | undefined;

afterEach(() => {
	dispose?.();
	dispose = undefined;
	push.enable.mockClear();
	push.disable.mockClear();
	push.read.mockClear();
	push.support = "default";
	push.subscribed = false;
	push.configured = true;
});

function createDevice(open: () => boolean = () => true): PushDevice {
	return createRoot((d) => {
		dispose = d;
		return usePushDevice(open);
	});
}

test("allowed and subscribed: push is on once the subscription is read", async () => {
	push.support = "granted";
	push.subscribed = true;
	const device = createDevice();
	expect(push.read).toHaveBeenCalledOnce();
	await vi.waitFor(() => {
		expect(device.pushOn()).toBe(true);
	});
	expect(device.canToggle()).toBe(true);
});

test("allowed but not subscribed: push stays off after the read", async () => {
	push.support = "granted";
	const device = createDevice();
	await vi.waitFor(() => {
		expect(push.read).toHaveBeenCalledOnce();
	});
	await push.read.mock.results[0]?.value;
	expect(device.pushOn()).toBe(false);
	expect(device.canToggle()).toBe(true);
});

test("not configured on this deployment: off and not toggleable", () => {
	push.configured = false;
	push.support = "granted";
	push.subscribed = true;
	const device = createDevice();
	expect(device.pushOn()).toBe(false);
	expect(device.canToggle()).toBe(false);
});

test.each(["unsupported", "ios", "denied"])("%s: not toggleable", (support) => {
	push.support = support;
	const device = createDevice();
	expect(device.canToggle()).toBe(false);
});

test("re-reads the device state each time it opens", async () => {
	const [open, setOpen] = createSignal(false);
	const device = createDevice(open);
	expect(push.read).not.toHaveBeenCalled();
	push.support = "granted";
	push.subscribed = true;
	setOpen(true);
	await vi.waitFor(() => {
		expect(device.pushOn()).toBe(true);
	});
	expect(device.support()).toBe("granted");
	expect(push.read).toHaveBeenCalledOnce();
});

test("an error from the last open is cleared on the next open", async () => {
	push.enable.mockRejectedValueOnce(new Error("boom"));
	const [open, setOpen] = createSignal(true);
	const device = createDevice(open);
	await device.enable();
	expect(device.error()).toBe("Could not turn on notifications.");
	setOpen(false);
	expect(device.error()).toBe("Could not turn on notifications.");
	setOpen(true);
	expect(device.error()).toBeUndefined();
});

test("enable calls enablePush and turns push on", async () => {
	const device = createDevice();
	expect(device.pushOn()).toBe(false);
	await device.enable();
	expect(push.enable).toHaveBeenCalledOnce();
	expect(device.pushOn()).toBe(true);
	expect(device.support()).toBe("granted");
});

test("enable resolving denied leaves push off and blocked", async () => {
	push.enable.mockResolvedValueOnce("denied");
	const device = createDevice();
	await device.enable();
	expect(device.pushOn()).toBe(false);
	expect(device.support()).toBe("denied");
	expect(device.canToggle()).toBe(false);
	expect(device.error()).toBeUndefined();
});

test("busy while a call is in flight, and a second call is ignored", async () => {
	let finish: ((value: string) => void) | undefined;
	push.enable.mockImplementationOnce(
		() =>
			new Promise<string>((resolve) => {
				finish = resolve;
			})
	);
	const device = createDevice();
	const first = device.enable();
	expect(device.busy()).toBe(true);
	await device.enable();
	await device.disable();
	expect(push.enable).toHaveBeenCalledOnce();
	expect(push.disable).not.toHaveBeenCalled();
	finish?.("granted");
	await first;
	expect(device.busy()).toBe(false);
	expect(device.pushOn()).toBe(true);
});

test("a failed enable keeps push off and says why", async () => {
	push.enable.mockRejectedValueOnce(
		new Error("The service worker is not ready.")
	);
	const device = createDevice();
	await device.enable();
	expect(device.error()).toBe(
		"The app is still starting up. Try again in a moment."
	);
	expect(device.pushOn()).toBe(false);
	expect(device.busy()).toBe(false);
});

test("disable calls disablePush and turns push off", async () => {
	push.support = "granted";
	push.subscribed = true;
	push.disable.mockImplementationOnce(() => {
		push.subscribed = false;
		return Promise.resolve();
	});
	const device = createDevice();
	await vi.waitFor(() => {
		expect(device.pushOn()).toBe(true);
	});
	await device.disable();
	expect(push.disable).toHaveBeenCalledOnce();
	expect(device.pushOn()).toBe(false);
	expect(device.error()).toBeUndefined();
});

test("a failed disable that still dropped the subscription ends off", async () => {
	push.support = "granted";
	push.subscribed = true;
	push.disable.mockImplementationOnce(() => {
		push.subscribed = false;
		return Promise.reject(new Error("boom"));
	});
	const device = createDevice();
	await vi.waitFor(() => {
		expect(device.pushOn()).toBe(true);
	});
	await device.disable();
	expect(device.error()).toBe("Could not turn off notifications.");
	expect(device.pushOn()).toBe(false);
});

test("a failed disable before the subscription was dropped stays on", async () => {
	push.support = "granted";
	push.subscribed = true;
	push.disable.mockRejectedValueOnce(new Error("boom"));
	const device = createDevice();
	await vi.waitFor(() => {
		expect(device.pushOn()).toBe(true);
	});
	await device.disable();
	expect(device.error()).toBe("Could not turn off notifications.");
	expect(device.pushOn()).toBe(true);
	expect(device.busy()).toBe(false);
});

test("configured reflects pushConfigured", () => {
	const device = createDevice();
	expect(device.configured()).toBe(true);
	push.configured = false;
	expect(device.configured()).toBe(false);
});
