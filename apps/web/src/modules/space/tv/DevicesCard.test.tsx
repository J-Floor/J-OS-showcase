// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ConfirmProvider } from "../../../shared/confirm.tsx";

import { DevicesCard } from "./DevicesCard.tsx";

// `convex-solidjs` is stubbed: queries answer from signals the test sets by
// function name, mutations record their (name, args).
const convexMock = vi.hoisted(() => ({
	set: vi.fn<(name: string, value: unknown) => void>(),
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(() =>
		Promise.resolve(null)
	),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	const { createSignal } = await import("solid-js");
	const signals = new Map<string, ReturnType<typeof createSignal<unknown>>>();
	function signalFor(name: string) {
		const existing = signals.get(name);
		if (existing) return existing;
		const created = createSignal<unknown>(undefined);
		signals.set(name, created);
		return created;
	}
	convexMock.set.mockImplementation((name, value) => {
		signalFor(name)[1](() => value);
	});
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: (reference: Parameters<typeof getFunctionName>[0]) => ({
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		}),
	};
});

const HOUR_MS = 60 * 60 * 1000;

beforeEach(() => {
	convexMock.mutate.mockClear();
	convexMock.set("tv:listDevices", [
		{
			_id: "device-live",
			label: "Lobby TV",
			createdAt: 1,
			lastSeenAt: Date.now() - 2 * HOUR_MS,
			revokedAt: undefined,
			schedule: [{ day: "sat", closed: true }],
		},
		{
			_id: "device-never",
			label: "Spare TV",
			createdAt: 2,
			lastSeenAt: undefined,
			revokedAt: undefined,
		},
		{
			_id: "device-gone",
			label: "Old TV",
			createdAt: 3,
			lastSeenAt: Date.now() - 48 * HOUR_MS,
			revokedAt: Date.now() - HOUR_MS,
		},
	]);
});

afterEach(cleanup);

function renderCard() {
	return render(() => (
		<ConfirmProvider>
			<DevicesCard />
		</ConfirmProvider>
	));
}

function rowOf(label: string): HTMLElement {
	const row = screen.getByText(label).closest("li");
	if (!row) throw new Error(`no row for ${label}`);
	return row;
}

test("lists each TV with when it was last seen", () => {
	renderCard();
	expect(
		within(rowOf("Lobby TV")).getByText("Last seen 2h ago")
	).toBeInTheDocument();
	expect(
		within(rowOf("Spare TV")).getByText("Not seen yet")
	).toBeInTheDocument();
});

test("revoking asks first and revokes only once confirmed", async () => {
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Revoke Lobby TV" }));
	const confirm = await screen.findByRole("button", { name: "Revoke" });
	expect(convexMock.mutate).not.toHaveBeenCalled();
	fireEvent.click(confirm);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:revokeDevice", {
			id: "device-live",
		});
	});
});

test("declining the question revokes nothing", async () => {
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Revoke Lobby TV" }));
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
	});
	expect(convexMock.mutate).not.toHaveBeenCalled();
});

test("a revoked TV says so and has no revoke button", () => {
	renderCard();
	const row = rowOf("Old TV");
	expect(within(row).getByText("Revoked")).toBeInTheDocument();
	expect(within(row).queryByRole("button")).toBeNull();
	expect(screen.queryByRole("button", { name: "Revoke Old TV" })).toBeNull();
});

// This card is not a way to connect a TV: that happens only from the TV's own
// QR code. So the only place the word may appear is the explanation, and there
// is no button or field to connect one with.
test("there is no way to pair here: only the explanation mentions it", () => {
	renderCard();
	const mentions = screen.getAllByText(/pair|connect|scan/i);
	expect(mentions).toHaveLength(1);
	expect(mentions[0]).toHaveTextContent(
		"Open the TV app to show a QR code, then scan it with your phone."
	);
	expect(
		screen.queryByRole("button", { name: /pair|connect|add/i })
	).toBeNull();
	expect(screen.queryByRole("textbox")).toBeNull();
});

test("a TV with a schedule says it has custom hours", () => {
	renderCard();
	expect(
		within(rowOf("Lobby TV")).getByText("Custom hours")
	).toBeInTheDocument();
	expect(within(rowOf("Spare TV")).queryByText("Custom hours")).toBeNull();
});

test("the schedule button opens the sheet for that TV; a revoked TV has none", async () => {
	renderCard();
	expect(
		screen.queryByRole("button", { name: "Schedule for Old TV" })
	).toBeNull();
	fireEvent.click(
		screen.getByRole("button", { name: "Schedule for Lobby TV" })
	);
	expect(await screen.findAllByRole("radiogroup")).toHaveLength(7);
});
