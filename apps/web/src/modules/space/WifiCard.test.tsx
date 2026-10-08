// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

const { logWifiOpenMutate, updateWifiMutate } = vi.hoisted(() => ({
	logWifiOpenMutate: vi.fn(() => Promise.resolve(null)),
	updateWifiMutate: vi.fn(() => Promise.resolve(null)),
}));

// convex-solidjs's useQuery/useMutation throw "must be used within
// ConvexProvider" when rendered without a provider. Stub them out so
// WifiCard renders without one. Convex's `api` is a proxy whose refs aren't
// `===`-stable (see InventoryPage.test.tsx), so `useMutation` routes by the
// function's stable string name rather than by reference.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => ({ ssid: "J floor", password: "test-wifi-password" }),
		error: () => undefined,
		isLoading: () => false,
	}),
	useMutation: (fn: unknown) => {
		const name = getFunctionName(
			fn as Parameters<typeof getFunctionName>[0]
		);
		const mutateAsync =
			name === "wifi:update" ? updateWifiMutate : logWifiOpenMutate;
		return {
			mutate: mutateAsync,
			mutateAsync,
			data: () => undefined,
			error: () => undefined,
			isLoading: () => false,
			reset: () => {},
		};
	},
}));

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { WifiCard } from "./WifiCard.tsx";

const PHONE_HINT =
	"Viewing on phone? Use Circle to Search (long-press your home button/pill)";

afterEach(() => {
	cleanup();
	logWifiOpenMutate.mockClear();
	updateWifiMutate.mockClear();
});

function renderAs(role: Role) {
	return render(() => (
		<AbilityProvider role={role}>
			<WifiCard />
		</AbilityProvider>
	));
}

test("shows the network's QR code and the phone hint inline, with no button to open them", () => {
	renderAs("member");
	expect(screen.getByText("J floor")).toBeInTheDocument();
	expect(screen.getByText(PHONE_HINT)).toBeInTheDocument();
	// A role query only finds what is in the a11y tree, so this fails if the
	// code sits in a closed (hidden) dialog. The copy control is the only
	// button: no "Show Wi-Fi code" opener any more.
	expect(screen.getAllByRole("button")).toEqual([
		screen.getByRole("button", { name: "Copy password" }),
	]);
});

test("records the first view via the logWifiOpen mutation on render", () => {
	renderAs("member");
	expect(logWifiOpenMutate).toHaveBeenCalledWith({});
});

test("a non-board member does not see the edit control", () => {
	renderAs("member");
	expect(
		screen.queryByRole("button", { name: /^Edit/ })
	).not.toBeInTheDocument();
});

test("board sees the edit control and saving calls wifi.update with the entered credentials", () => {
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));

	// The form takes the code's place and the phone hint goes while editing.
	expect(screen.queryByText("J floor")).not.toBeInTheDocument();
	expect(screen.queryByText(PHONE_HINT)).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /^Edit/ })
	).not.toBeInTheDocument();

	const ssidInput = screen.getByLabelText("Network name");
	const passwordInput = screen.getByLabelText("Password");
	fireEvent.input(ssidInput, { target: { value: "New network" } });
	fireEvent.input(passwordInput, { target: { value: "new-password" } });

	fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

	expect(updateWifiMutate).toHaveBeenCalledWith({
		ssid: "New network",
		password: "new-password",
	});
});

test("cancelling the edit brings the code back without saving", () => {
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
	fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
	expect(screen.getByText("J floor")).toBeInTheDocument();
	expect(updateWifiMutate).not.toHaveBeenCalled();
});
