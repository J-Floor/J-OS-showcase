// @vitest-environment happy-dom
import { JFloorProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { calls, disablePush, signOut, navigate } = vi.hoisted(() => {
	const calls: string[] = [];
	return {
		calls,
		disablePush: vi.fn(() => {
			calls.push("disablePush");
			return Promise.resolve();
		}),
		signOut: vi.fn(() => {
			calls.push("signOut");
			return Promise.resolve();
		}),
		navigate: vi.fn(),
	};
});
vi.mock("../../lib/push.ts", () => ({ disablePush }));
vi.mock("../../lib/auth.ts", () => ({ authClient: { signOut } }));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import { ConfirmProvider } from "../../shared/confirm.tsx";

import { SignOutButton } from "./SignOutButton.tsx";

afterEach(() => {
	cleanup();
	calls.length = 0;
	vi.clearAllMocks();
});

function renderButton(): void {
	render(() => (
		<JFloorProvider>
			<ConfirmProvider>
				<SignOutButton />
			</ConfirmProvider>
		</JFloorProvider>
	));
}

async function openConfirm(): Promise<HTMLElement> {
	fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
	return screen.findByRole("dialog");
}

async function confirmSignOut(): Promise<void> {
	const dialog = await openConfirm();
	fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
}

test("is an icon button named Sign out", () => {
	renderButton();
	const button = screen.getByRole("button", { name: "Sign out" });
	expect(button).toHaveAttribute("aria-label", "Sign out");
	expect(button).not.toHaveTextContent("Sign out");
});

test("asks before signing out, and Cancel signs nothing out", async () => {
	renderButton();
	const dialog = await openConfirm();
	expect(within(dialog).getByText("Sign out?")).toBeInTheDocument();
	expect(
		within(dialog).getByText(
			"You'll need a new sign-in link from your email to get back in."
		)
	).toBeInTheDocument();
	fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
	expect(disablePush).not.toHaveBeenCalled();
	expect(signOut).not.toHaveBeenCalled();
	expect(navigate).not.toHaveBeenCalled();
});

test("removes this device's push subscription before signing out", async () => {
	renderButton();
	await confirmSignOut();
	await waitFor(() => {
		expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
	});
	expect(calls).toEqual(["disablePush", "signOut"]);
});

test("still signs out when removing the subscription fails", async () => {
	disablePush.mockImplementationOnce(() =>
		Promise.reject(new Error("offline"))
	);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	renderButton();
	await confirmSignOut();
	await waitFor(() => {
		expect(signOut).toHaveBeenCalledOnce();
	});
});

test("signs out even when removing the subscription never settles", async () => {
	// Stands in for disablePush's own timeout: it rejects once that elapses.
	disablePush.mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				setTimeout(() => {
					reject(new Error("The server did not confirm in time."));
				}, 4_000);
			})
	);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	renderButton();
	// Open the dialog on real timers (findByRole polls); fake them only for
	// the part that waits on disablePush's timeout.
	const dialog = await openConfirm();
	vi.useFakeTimers();
	try {
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Sign out" })
		);
		expect(signOut).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(4_000);
		expect(signOut).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
	} finally {
		vi.useRealTimers();
	}
});
