// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

type ConfirmResult = {
	status: "verified" | "expired" | "invalid" | "ended";
	wifi?: { ssid: string; password: string };
};

const { mutateAsync, searchParams } = vi.hoisted(() => {
	const initial: Record<string, string> = { token: "tok" };
	return {
		mutateAsync: vi.fn<(args: { token: string }) => Promise<ConfirmResult>>(
			() =>
				Promise.resolve({
					status: "verified",
					wifi: { ssid: "J floor", password: "test-wifi-password" },
				})
		),
		searchParams: { current: initial },
	};
});
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync }),
}));
vi.mock("@solidjs/router", () => ({
	useSearchParams: () => [searchParams.current],
}));
vi.mock("../space/WifiContent.tsx", () => ({
	WifiContent: (props: { ssid: string; password: string }) => (
		<div data-testid="wifi-content">
			{props.ssid} / {props.password}
		</div>
	),
}));

import { EventInviteConfirm } from "./EventInviteConfirm.tsx";

afterEach(() => {
	cleanup();
	searchParams.current = { token: "tok" };
	mutateAsync.mockClear();
});

test("confirms on mount and shows the thanks message with the Wi-Fi", async () => {
	render(() => <EventInviteConfirm />);
	await vi.waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ token: "tok" });
	});
	expect(
		await screen.findByRole("heading", { name: /you're in/i })
	).toBeInTheDocument();
	expect(screen.getByTestId("wifi-content")).toHaveTextContent(
		"J floor / test-wifi-password"
	);
	expect(
		screen.getByRole("link", { name: /open the space page/i })
	).toHaveAttribute("href", "/space");
});

test("shows the expired message and no Wi-Fi", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "expired" });
	render(() => <EventInviteConfirm />);
	expect(
		await screen.findByText(/this link has expired/i)
	).toBeInTheDocument();
	expect(screen.queryByTestId("wifi-content")).not.toBeInTheDocument();
});

test("shows the invalid message when the action rejects", async () => {
	mutateAsync.mockRejectedValueOnce(new Error("nope"));
	render(() => <EventInviteConfirm />);
	expect(
		await screen.findByText(/this link isn't valid/i)
	).toBeInTheDocument();
	expect(screen.queryByTestId("wifi-content")).not.toBeInTheDocument();
});

test("shows invalid without calling the action when there is no token param", async () => {
	searchParams.current = {};
	render(() => <EventInviteConfirm />);
	expect(
		await screen.findByText(/this link isn't valid/i)
	).toBeInTheDocument();
	expect(mutateAsync).not.toHaveBeenCalled();
});

test("shows an ended message and no Wi-Fi when the event has ended", async () => {
	mutateAsync.mockResolvedValueOnce({ status: "ended" });
	render(() => <EventInviteConfirm />);
	expect(
		await screen.findByRole("heading", { name: /this event has ended/i })
	).toBeInTheDocument();
	expect(
		screen.getByText(/wi-fi link is no longer active/i)
	).toBeInTheDocument();
	expect(screen.queryByTestId("wifi-content")).not.toBeInTheDocument();
});
