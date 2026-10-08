// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { PushSupport } from "../../lib/push.ts";

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

import { NotificationDeviceRow } from "./NotificationDeviceRow.tsx";
import { usePushDevice, type PushDevice } from "./usePushDevice.ts";

afterEach(() => {
	cleanup();
	push.enable.mockClear();
	push.disable.mockClear();
	push.read.mockClear();
	push.support = "default";
	push.subscribed = false;
	push.configured = true;
});

const NAME = "Push notifications on this device";

function fakeDevice(state: {
	support?: PushSupport;
	pushOn?: boolean;
	configured?: boolean;
	busy?: boolean;
	error?: string;
}): PushDevice {
	const support = state.support ?? "default";
	const configured = state.configured ?? true;
	return {
		support: () => support,
		busy: () => state.busy ?? false,
		error: () => state.error,
		pushOn: () => state.pushOn ?? false,
		configured: () => configured,
		canToggle: () =>
			configured && (support === "default" || support === "granted"),
		enable: vi.fn(() => Promise.resolve()),
		disable: vi.fn(() => Promise.resolve()),
	};
}

function renderRow(device: PushDevice) {
	return render(() => <NotificationDeviceRow device={device} />);
}

function renderWithHook(open: () => boolean = () => true) {
	return render(() => {
		const device = usePushDevice(open);
		return <NotificationDeviceRow device={device} />;
	});
}

function toggle(): HTMLElement {
	return screen.getByRole("switch", { name: NAME });
}

test("not configured on this deployment: off, disabled, says so", () => {
	renderRow(fakeDevice({ support: "granted", configured: false }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeDisabled();
	expect(toggle()).toHaveAccessibleDescription(
		"Push notifications aren't set up yet."
	);
});

test("an unsupported browser: off, disabled, email still reaches you", () => {
	renderRow(fakeDevice({ support: "unsupported" }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeDisabled();
	expect(
		screen.getByText(
			"This browser cannot show notifications. Notifications with an email version still reach you by email."
		)
	).toBeInTheDocument();
});

test("iOS: off, disabled, no install nudge", () => {
	renderRow(fakeDevice({ support: "ios" }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeDisabled();
	expect(
		screen.getByText(
			"Push notifications aren't available on iPhone or iPad. Notifications with an email version still reach you by email."
		)
	).toBeInTheDocument();
	expect(screen.queryByText(/Home Screen/)).not.toBeInTheDocument();
});

test("blocked by the browser: off, disabled, explains how to allow it", () => {
	renderRow(fakeDevice({ support: "denied" }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeDisabled();
	expect(screen.getByText(/blocked for this site/)).toBeInTheDocument();
});

test("not asked yet: off and enabled", () => {
	renderRow(fakeDevice({ support: "default" }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeEnabled();
	expect(toggle()).toHaveAccessibleDescription(
		"Off. Turn on to get notifications here as well as by email."
	);
});

test("allowed but not subscribed: off and enabled", () => {
	renderRow(fakeDevice({ support: "granted", pushOn: false }));
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeEnabled();
	expect(toggle()).toHaveAccessibleDescription(
		"Off. Turn on to get notifications here as well as by email."
	);
});

test("allowed and subscribed: on and enabled", () => {
	renderRow(fakeDevice({ support: "granted", pushOn: true }));
	expect(toggle()).toBeChecked();
	expect(toggle()).toBeEnabled();
	expect(toggle()).toHaveAccessibleDescription("On.");
});

test("the switch is disabled while a call is in flight", () => {
	renderRow(fakeDevice({ support: "granted", busy: true }));
	expect(toggle()).toBeDisabled();
});

test("turning it on calls enable", async () => {
	const device = fakeDevice({ support: "default" });
	renderRow(device);
	fireEvent.click(toggle());
	await waitFor(() => {
		expect(device.enable).toHaveBeenCalledOnce();
	});
	expect(device.disable).not.toHaveBeenCalled();
});

test("turning it off calls disable", async () => {
	const device = fakeDevice({ support: "granted", pushOn: true });
	renderRow(device);
	fireEvent.click(toggle());
	await waitFor(() => {
		expect(device.disable).toHaveBeenCalledOnce();
	});
	expect(device.enable).not.toHaveBeenCalled();
});

test("shows the device's error message", () => {
	renderRow(
		fakeDevice({
			support: "granted",
			pushOn: true,
			error: "Could not turn off notifications.",
		})
	);
	expect(
		screen.getByText("Could not turn off notifications.")
	).toBeInTheDocument();
	expect(toggle()).toBeChecked();
});

test("with the hook: allowed but not subscribed stays off after the read", async () => {
	push.support = "granted";
	push.subscribed = false;
	renderWithHook();
	await waitFor(() => {
		expect(push.read).toHaveBeenCalledOnce();
	});
	await push.read.mock.results[0]?.value;
	expect(toggle()).not.toBeChecked();
	expect(toggle()).toBeEnabled();
	expect(toggle()).toHaveAccessibleDescription(
		"Off. Turn on to get notifications here as well as by email."
	);
});

test("with the hook: turning it on calls enablePush and ends on", async () => {
	renderWithHook();
	fireEvent.click(toggle());
	await waitFor(() => {
		expect(push.enable).toHaveBeenCalledOnce();
	});
	await waitFor(() => {
		expect(toggle()).toBeChecked();
	});
	expect(toggle()).toHaveAccessibleDescription("On.");
});

test("with the hook: enable resolving denied ends off, disabled and blocked", async () => {
	push.enable.mockResolvedValueOnce("denied");
	renderWithHook();
	fireEvent.click(toggle());
	await waitFor(() => {
		expect(toggle()).toHaveAccessibleDescription(
			"Notifications are blocked for this site. Allow them in your browser's site settings, then come back here."
		);
	});
	expect(toggle()).toBeDisabled();
	expect(toggle()).not.toBeChecked();
});

test("with the hook: a failed enable shows the message and the switch stays off", async () => {
	push.enable.mockRejectedValueOnce(
		new Error("The service worker is not ready.")
	);
	renderWithHook();
	fireEvent.click(toggle());
	expect(await screen.findByText(/still starting up/)).toBeInTheDocument();
	await waitFor(() => {
		expect(toggle()).not.toBeChecked();
	});
});

test("with the hook: an error from the last open is gone on the next open", async () => {
	push.enable.mockRejectedValueOnce(new Error("boom"));
	const [open, setOpen] = createSignal(true);
	render(() => {
		const device = usePushDevice(open);
		return <NotificationDeviceRow device={device} />;
	});
	fireEvent.click(toggle());
	expect(
		await screen.findByText("Could not turn on notifications.")
	).toBeInTheDocument();
	setOpen(false);
	setOpen(true);
	await waitFor(() => {
		expect(
			screen.queryByText("Could not turn on notifications.")
		).not.toBeInTheDocument();
	});
});

test("with the hook: re-reads the device state each time it opens", async () => {
	const [open, setOpen] = createSignal(false);
	render(() => {
		const device = usePushDevice(open);
		return <NotificationDeviceRow device={device} />;
	});
	push.support = "granted";
	push.subscribed = true;
	setOpen(true);
	await waitFor(() => {
		expect(toggle()).toBeChecked();
	});
});
