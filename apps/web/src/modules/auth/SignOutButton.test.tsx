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

const { signOut } = vi.hoisted(() => ({
	signOut: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../shared/useSignOut.ts", () => ({ useSignOut: () => signOut }));

import { ConfirmProvider } from "../../shared/confirm.tsx";

import { SignOutButton } from "./SignOutButton.tsx";

afterEach(() => {
	cleanup();
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
	expect(signOut).not.toHaveBeenCalled();
});

test("signs out after a yes", async () => {
	renderButton();
	const dialog = await openConfirm();
	fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
	await waitFor(() => {
		expect(signOut).toHaveBeenCalledOnce();
	});
});
