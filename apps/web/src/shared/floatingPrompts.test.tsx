// @vitest-environment happy-dom
import { FloatingStack } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ok, type Result } from "neverthrow";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ClientError } from "../lib/call.ts";

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
vi.mock("../lib/push.ts", () => ({
	pushConfigured: () => push.configured,
	pushSupport: () => push.support,
	enablePush: push.enable,
}));

import { InstallPwaPrompt } from "./InstallPwaPrompt.tsx";
import { NotificationsPrompt } from "./notifications/NotificationsPrompt.tsx";
import { resetInstallPromptForTest } from "./pwaInstall.ts";

beforeEach(() => {
	resetInstallPromptForTest();
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

function fireBeforeInstallPrompt(): void {
	const event = new Event("beforeinstallprompt", {
		cancelable: true,
	}) as Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: string }>;
	};
	event.prompt = () => Promise.resolve();
	event.userChoice = Promise.resolve({ outcome: "accepted" });
	window.dispatchEvent(event);
}

function renderStack() {
	return render(() => (
		<FloatingStack>
			<NotificationsPrompt />
			<InstallPwaPrompt />
		</FloatingStack>
	));
}

test("both prompts show together, notifications above install", async () => {
	fireBeforeInstallPrompt();
	renderStack();
	const install = await screen.findByText("Install app");
	const notifications = screen.getByText("Enable notifications");
	expect(
		notifications.compareDocumentPosition(install) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("dismissing one prompt leaves the other", async () => {
	fireBeforeInstallPrompt();
	renderStack();
	await screen.findByText("Install app");

	// Two Dismiss buttons, in stack order: notifications first, install second.
	const [dismissNotifications] = screen.getAllByRole("button", {
		name: "Dismiss",
	});
	fireEvent.click(dismissNotifications);

	expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();
	expect(screen.getByText("Install app")).toBeInTheDocument();
});

test("dismissing install leaves notifications", async () => {
	fireBeforeInstallPrompt();
	renderStack();
	await screen.findByText("Install app");

	const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
	fireEvent.click(dismissButtons[1]);

	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
	expect(screen.getByText("Enable notifications")).toBeInTheDocument();
});

test("an empty stack holds nothing that could take a click", () => {
	push.support = "granted";
	const { container } = renderStack();
	const stack = container.firstElementChild;
	expect(stack).not.toBeNull();
	expect(stack?.textContent).toBe("");
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});
