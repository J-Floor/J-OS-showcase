// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

type ConfirmResult = {
	status: "verified" | "invalid" | "expired" | "taken";
};

const { mutateAsync, searchParams } = vi.hoisted(() => {
	const initial: Record<string, string> = { token: "tok" };
	return {
		mutateAsync: vi.fn<(args: { token: string }) => Promise<ConfirmResult>>(
			() => Promise.resolve({ status: "verified" })
		),
		searchParams: { current: initial },
	};
});
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync }),
}));
vi.mock("@solidjs/router", () => ({
	useSearchParams: () => [searchParams.current],
}));

import { EmailChangeConfirm } from "./EmailChangeConfirm.tsx";

afterEach(() => {
	cleanup();
	searchParams.current = { token: "tok" };
	mutateAsync.mockClear();
});

test("confirms on mount and says the address changed", async () => {
	render(() => <EmailChangeConfirm />);
	await vi.waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ token: "tok" });
	});
	expect(
		await screen.findByRole("heading", {
			name: /your sign-in address is changed/i,
		})
	).toBeInTheDocument();
	expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
		"href",
		"/signin"
	);
});

test("says the address is taken", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "taken" });
	render(() => <EmailChangeConfirm />);
	expect(
		await screen.findByRole("heading", { name: /already in use/i })
	).toBeInTheDocument();
});

test("says the link expired", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "expired" });
	render(() => <EmailChangeConfirm />);
	expect(
		await screen.findByText(/this link has expired/i)
	).toBeInTheDocument();
});

test("shows the invalid message when the mutation rejects", async () => {
	mutateAsync.mockRejectedValueOnce(new Error("nope"));
	render(() => <EmailChangeConfirm />);
	expect(
		await screen.findByText(/this link isn't valid/i)
	).toBeInTheDocument();
});

test("shows invalid without calling the mutation when there is no token param", async () => {
	searchParams.current = {};
	render(() => <EmailChangeConfirm />);
	expect(
		await screen.findByText(/this link isn't valid/i)
	).toBeInTheDocument();
	expect(mutateAsync).not.toHaveBeenCalled();
});
