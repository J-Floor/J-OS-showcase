// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: {
		configured: true,
		support: "default",
		enable: vi.fn(() => Promise.resolve("granted")),
	},
}));
vi.mock("../../lib/push.ts", () => ({
	pushConfigured: () => push.configured,
	pushSupport: () => push.support,
	enablePush: push.enable,
}));

import { NotificationsPrompt } from "./NotificationsPrompt.tsx";

beforeEach(() => {
	try {
		localStorage.clear();
	} catch {
		// no-op
	}
});
afterEach(() => {
	cleanup();
	push.configured = true;
	push.support = "default";
	push.enable.mockClear();
});

test("offers notifications once push is configured and not yet decided", () => {
	render(() => <NotificationsPrompt />);
	expect(screen.getByText("Enable notifications")).toBeInTheDocument();
});

test("stays hidden when this build has no VAPID key", () => {
	push.configured = false;
	render(() => <NotificationsPrompt />);
	expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();
});

test.each(["granted", "denied", "unsupported", "ios"])(
	"stays hidden when the device state is %s",
	(state) => {
		push.support = state;
		render(() => <NotificationsPrompt />);
		expect(
			screen.queryByText("Enable notifications")
		).not.toBeInTheDocument();
	}
);

test("enabling runs the real permission flow and hides the pill", async () => {
	render(() => <NotificationsPrompt />);
	fireEvent.click(screen.getByText("Enable notifications"));
	await waitFor(() => {
		expect(push.enable).toHaveBeenCalledOnce();
		expect(
			screen.queryByText("Enable notifications")
		).not.toBeInTheDocument();
	});
});

test("dismissing hides it for good", () => {
	const first = render(() => <NotificationsPrompt />);
	fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
	expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();
	first.unmount();
	render(() => <NotificationsPrompt />);
	expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();
});

test("a refused permission dismisses the pill for good", async () => {
	push.enable.mockResolvedValueOnce("denied");
	const first = render(() => <NotificationsPrompt />);
	fireEvent.click(screen.getByText("Enable notifications"));
	await waitFor(() => {
		expect(
			screen.queryByText("Enable notifications")
		).not.toBeInTheDocument();
	});
	first.unmount();
	push.support = "default";
	render(() => <NotificationsPrompt />);
	expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();
});

test("a thrown error keeps the pill up so it can be retried", async () => {
	const error = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);
	push.enable.mockRejectedValueOnce(new Error("timeout"));
	render(() => <NotificationsPrompt />);
	fireEvent.click(screen.getByText("Enable notifications"));
	await waitFor(() => {
		expect(error).toHaveBeenCalled();
	});
	expect(screen.getByText("Enable notifications")).toBeInTheDocument();
	expect(localStorage.getItem("jf-push-prompt-dismissed")).toBeNull();
	fireEvent.click(screen.getByText("Enable notifications"));
	await waitFor(() => {
		expect(push.enable).toHaveBeenCalledTimes(2);
	});
	error.mockRestore();
});
