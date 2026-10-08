// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

type SessionState = {
	data: { user: { email: string } } | null;
	isPending: boolean;
};
const mocks = vi.hoisted(() => {
	const sessionState: SessionState = { data: null, isPending: false };
	return {
		signOut: vi.fn(() => Promise.resolve()),
		navigate: vi.fn(),
		sessionState,
	};
});
const { signOut, navigate } = mocks;

vi.mock("../lib/auth.ts", () => ({
	authClient: {
		useSession: () => () => mocks.sessionState,
		signOut: mocks.signOut,
	},
}));
vi.mock("@solidjs/router", () => ({ useNavigate: () => mocks.navigate }));

import { NoAccess } from "./NoAccess.tsx";

afterEach(() => {
	cleanup();
	mocks.sessionState = { data: null, isPending: false };
	signOut.mockClear();
	navigate.mockClear();
});

describe("NoAccess", () => {
	it("names the signed-in email and suggests another one", () => {
		mocks.sessionState = {
			data: { user: { email: "ada@example.com" } },
			isPending: false,
		};
		render(() => <NoAccess />);
		expect(
			screen.getByText(
				"You're signed in as ada@example.com, which has no J floor access. If you're a member, you may have applied with a different email: sign out and use that one."
			)
		).toBeInTheDocument();
	});

	it("falls back to 'This email' without a session email", () => {
		render(() => <NoAccess />);
		expect(
			screen.getByText(
				"This email has no J floor access. If you're a member, you may have applied with a different email: sign out and use that one."
			)
		).toBeInTheDocument();
	});

	it("signs out and goes to sign-in", async () => {
		render(() => <NoAccess />);
		fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
		await vi.waitFor(() => {
			expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
		});
		expect(signOut).toHaveBeenCalledTimes(1);
	});
});
