// @vitest-environment happy-dom
import {
	ShortcutPeekProvider,
	setDeferredImmediate,
} from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { logWifiOpenMutate, updateWifiMutate, credentials } = vi.hoisted(() => ({
	logWifiOpenMutate: vi.fn(() => Promise.resolve(null)),
	updateWifiMutate: vi.fn(() => Promise.resolve(null)),
	credentials: {
		value: undefined as { ssid: string; password: string } | undefined,
	},
}));

// convex-solidjs's useQuery/useMutation throw "must be used within
// ConvexProvider" when rendered without a provider. Stub them out so
// WifiCard renders without one. Convex's `api` is a proxy whose refs aren't
// `===`-stable (see InventoryPage.test.tsx), so `useMutation` routes by the
// function's stable string name rather than by reference.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => credentials.value,
		error: () => {},
		isLoading: () => false,
	}),
	useMutation: (function_: unknown) => {
		const name = getFunctionName(
			function_ as Parameters<typeof getFunctionName>[0]
		);
		const mutateAsync =
			name === "wifi:update" ? updateWifiMutate : logWifiOpenMutate;
		return {
			mutate: mutateAsync,
			mutateAsync,
			data: () => {},
			error: () => {},
			isLoading: () => false,
			reset: () => {},
		};
	},
}));

import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { ShortcutPeekButton } from "../../shared/ShortcutPeekButton.tsx";

import { WifiCard } from "./WifiCard.tsx";

const PHONE_HINT =
	"Viewing on phone? Use Circle to Search (long-press your home button/pill)";

beforeEach(() => {
	credentials.value = { ssid: "J floor", password: "test-wifi-password" };
});

afterEach(() => {
	cleanup();
	setDeferredImmediate(false);
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

test("a refused save shows the reason in the form and keeps it open", async () => {
	updateWifiMutate.mockRejectedValueOnce(
		new ConvexError({
			code: "WifiSsidRequired",
			message: "SSID is required.",
		})
	);
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
	fireEvent.input(screen.getByLabelText("Network name"), {
		target: { value: "" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
	expect(await screen.findByText("SSID is required.")).toBeInTheDocument();
	expect(screen.getByLabelText("Network name")).toBeInTheDocument();
});

test("cancelling the edit brings the code back without saving", () => {
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
	fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
	expect(screen.getByText("J floor")).toBeInTheDocument();
	expect(updateWifiMutate).not.toHaveBeenCalled();
});

test("shows a skeleton and no QR code while the credentials load", () => {
	credentials.value = undefined;
	setDeferredImmediate(true);
	const { container } = renderAs("member");
	expect(container.querySelector("[data-wifi-skeleton]")).not.toBeNull();
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	expect(screen.queryByText("J floor")).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Copy password" })
	).not.toBeInTheDocument();
});

test("shows no skeleton once the credentials are here", () => {
	const { container } = renderAs("member");
	expect(container.querySelector("[data-wifi-skeleton]")).toBeNull();
	expect(screen.getByText("J floor")).toBeInTheDocument();
});

// Keys. Edit, Save and Cancel live only while the card is active.

function renderActive(role: Role) {
	return render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<AbilityProvider role={role}>
				<WifiCard active />
			</AbilityProvider>
		</ShortcutPeekProvider>
	));
}

const MOD_ENTER = { key: "Enter", ctrlKey: true };

test("E opens the edit form for the board, once", () => {
	renderActive("board");
	fireEvent.keyDown(document, { key: "e" });
	expect(screen.getByLabelText("Network name")).toBeInTheDocument();
	// Typing an "e" into a field is not a second press.
	fireEvent.keyDown(screen.getByLabelText("Network name"), { key: "e" });
	expect(screen.getByLabelText("Network name")).toBeInTheDocument();
});

test("E does nothing for a member, while typing or while the card is inactive", () => {
	renderActive("member");
	fireEvent.keyDown(document, { key: "e" });
	expect(screen.queryByLabelText("Network name")).not.toBeInTheDocument();
	cleanup();
	renderAs("board");
	fireEvent.keyDown(document, { key: "e" });
	expect(screen.queryByLabelText("Network name")).not.toBeInTheDocument();
	cleanup();
	render(() => (
		<AbilityProvider role="board">
			<input aria-label="note" />
			<WifiCard active />
		</AbilityProvider>
	));
	fireEvent.keyDown(screen.getByLabelText("note"), { key: "e" });
	expect(screen.queryByLabelText("Network name")).not.toBeInTheDocument();
});

test("Mod+Enter saves from inside a field, once", () => {
	renderActive("board");
	fireEvent.keyDown(document, { key: "e" });
	const ssid = screen.getByLabelText("Network name");
	fireEvent.input(ssid, { target: { value: "New network" } });
	fireEvent.keyDown(ssid, MOD_ENTER);
	expect(updateWifiMutate).toHaveBeenCalledTimes(1);
	expect(updateWifiMutate).toHaveBeenCalledWith({
		ssid: "New network",
		password: "test-wifi-password",
	});
	fireEvent.keyDown(ssid, { ...MOD_ENTER, repeat: true });
	expect(updateWifiMutate).toHaveBeenCalledTimes(1);
});

test("Mod+Enter saves nothing while the form is shut or the card is inactive", () => {
	renderActive("board");
	fireEvent.keyDown(document, MOD_ENTER);
	expect(updateWifiMutate).not.toHaveBeenCalled();
	cleanup();
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
	fireEvent.keyDown(screen.getByLabelText("Network name"), MOD_ENTER);
	expect(updateWifiMutate).not.toHaveBeenCalled();
});

test("Escape cancels the edit from inside a field, without saving", () => {
	renderActive("board");
	fireEvent.keyDown(document, { key: "e" });
	const ssid = screen.getByLabelText("Network name");
	fireEvent.input(ssid, { target: { value: "Typed" } });
	fireEvent.keyDown(ssid, { key: "Escape" });
	expect(screen.queryByLabelText("Network name")).not.toBeInTheDocument();
	expect(screen.getByText("J floor")).toBeInTheDocument();
	expect(updateWifiMutate).not.toHaveBeenCalled();
});

test("Edit, Cancel and Save name their keys, in a chip while peeking", () => {
	renderActive("board");
	const edit = screen.getByRole("button", { name: /^Edit/ });
	expect(edit).toHaveAttribute("aria-keyshortcuts", "E");
	expect(edit.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(edit.querySelector("kbd")).not.toBeNull();
	fireEvent.keyDown(document, { key: "e" });
	const save = screen.getByRole("button", { name: /Save/ });
	expect(save).toHaveAttribute("aria-keyshortcuts", "Control+Enter");
	expect(save.querySelector("kbd")).not.toBeNull();
	expect(
		screen.getByRole("button", { name: /Cancel/ }).querySelector("kbd")
	).not.toBeNull();
});

test("Save and Cancel keys leave an open dialog's keyboard to it", () => {
	renderActive("board");
	fireEvent.keyDown(document, { key: "e" });
	const dialog = document.createElement("div");
	dialog.setAttribute("role", "dialog");
	dialog.setAttribute("data-state", "open");
	const inside = document.createElement("button");
	dialog.append(inside);
	document.body.append(dialog);
	try {
		fireEvent.keyDown(inside, { key: "Escape" });
		fireEvent.keyDown(inside, MOD_ENTER);
		expect(screen.getByLabelText("Network name")).toBeInTheDocument();
		expect(updateWifiMutate).not.toHaveBeenCalled();
	} finally {
		dialog.remove();
	}
});
