// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { err, ok, type Result } from "neverthrow";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ClientError } from "../../lib/call.ts";

const { push } = vi.hoisted(() => ({
	push: {
		configured: true,
		support: "default",
		enable: vi.fn(
			(): Promise<Result<string, ClientError>> =>
				Promise.resolve(ok("granted"))
		),
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
	push.enable.mockResolvedValueOnce(ok("denied"));
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

test("a failure keeps the pill up with its message, so it can be retried", async () => {
	push.enable.mockResolvedValueOnce(
		err({ code: "Unknown", message: "Could not turn on notifications." })
	);
	render(() => <NotificationsPrompt />);
	fireEvent.click(screen.getByText("Enable notifications"));
	expect(
		await screen.findByText("Could not turn on notifications.")
	).toBeInTheDocument();
	expect(screen.getByText("Enable notifications")).toBeInTheDocument();
	expect(localStorage.getItem("jf-push-prompt-dismissed")).toBeNull();
	// The button takes clicks again once the attempt has finished.
	const button = screen.getByRole("button", { name: /Enable notifications/ });
	await waitFor(() => {
		expect(button).toHaveAttribute("data-loading", "false");
	});
	fireEvent.click(button);
	await waitFor(() => {
		expect(push.enable).toHaveBeenCalledTimes(2);
	});
});

test("a second click while the first attempt is pending asks only once", async () => {
	let settle!: (result: Result<string, ClientError>) => void;
	push.enable.mockReturnValueOnce(
		new Promise((resolve) => {
			settle = resolve;
		})
	);
	render(() => <NotificationsPrompt />);
	const button = screen.getByRole("button", { name: /Enable notifications/ });
	fireEvent.click(button);
	fireEvent.click(button);
	settle(ok("granted"));
	await waitFor(() => {
		expect(
			screen.queryByText("Enable notifications")
		).not.toBeInTheDocument();
	});
	expect(push.enable).toHaveBeenCalledOnce();
});
