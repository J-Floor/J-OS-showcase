// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

type ConfirmResult = {
	status: "verified" | "already" | "expired" | "invalid" | "ended";
	wifi?: { ssid: string; password: string };
	who?: { firstName: string; lastName: string; email: string };
};

const mutateAsync = vi.fn<(args: { token: string }) => Promise<ConfirmResult>>(
	() =>
		Promise.resolve({
			status: "verified",
			wifi: { ssid: "J floor", password: "test-wifi-password" },
			who: {
				firstName: "Ada",
				lastName: "Lovelace",
				email: "ada@example.com",
			},
		})
);
const navigate = vi.fn();
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync }),
}));
vi.mock("@solidjs/router", () => ({
	useSearchParams: () => [{ token: "tok" }],
	useNavigate: () => navigate,
}));

import { VisitorConfirm } from "./VisitorConfirm.tsx";

test("confirms on mount and shows the thanks message with the Wi-Fi", async () => {
	render(() => <VisitorConfirm />);
	await vi.waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ token: "tok" });
	});
	expect(
		await screen.findByRole("heading", { name: /you're in/i })
	).toBeInTheDocument();
	expect(screen.getByText("J floor")).toBeInTheDocument();
});

test("shows the expired message and no Wi-Fi", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "expired" });
	render(() => <VisitorConfirm />);
	expect(
		await screen.findByText(/this link has expired/i)
	).toBeInTheDocument();
	expect(screen.queryByText("J floor")).not.toBeInTheDocument();
});

test("shows an Apply to J floor button that navigates to sign-up with the visitor's details", async () => {
	render(() => <VisitorConfirm />);
	const button = await screen.findByRole("button", {
		name: /apply to j floor/i,
	});
	fireEvent.click(button);
	expect(navigate).toHaveBeenCalledWith("/sign-up", {
		state: {
			firstName: "Ada",
			lastName: "Lovelace",
			email: "ada@example.com",
		},
	});
});

test("does not show the Apply button when the action returns no who", async () => {
	mutateAsync.mockResolvedValueOnce({
		status: "verified",
		wifi: { ssid: "J floor", password: "test-wifi-password" },
	});
	render(() => <VisitorConfirm />);
	await screen.findByRole("heading", { name: /you're in/i });
	expect(
		screen.queryByRole("button", { name: /apply to j floor/i })
	).not.toBeInTheDocument();
});

test("shows an ended message and no Wi-Fi when the event has ended", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "ended" });
	render(() => <VisitorConfirm />);
	expect(
		await screen.findByRole("heading", { name: /this event has ended/i })
	).toBeInTheDocument();
	expect(
		screen.getByText(/wi-fi link is no longer active/i)
	).toBeInTheDocument();
	expect(screen.queryByText("J floor")).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /apply to j floor/i })
	).not.toBeInTheDocument();
});
