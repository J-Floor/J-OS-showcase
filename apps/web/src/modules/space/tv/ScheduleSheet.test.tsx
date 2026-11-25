// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";

import { ScheduleSheet } from "./ScheduleSheet.tsx";

// `convex-solidjs` is stubbed: mutations record their (name, args).
const convexMock = vi.hoisted(() => ({
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(() =>
		Promise.resolve(null)
	),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useMutation: (reference: Parameters<typeof getFunctionName>[0]) => ({
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		}),
	};
});

const DEVICE = {
	_id: "device-live" as Id<"tvDevices">,
	label: "Lobby TV",
	schedule: undefined,
};

const onOpenChange = vi.fn<(isOpen: boolean) => void>();

beforeEach(() => {
	convexMock.mutate.mockClear();
	onOpenChange.mockClear();
});

afterEach(cleanup);

function renderSheet() {
	return render(() => (
		<ScheduleSheet open onOpenChange={onOpenChange} device={DEVICE} />
	));
}

// Ark renders each Segment item's hidden input as a radio: click it. The
// machine applies the change after the click, so wait for it to show.
async function choose(day: string, value: string): Promise<void> {
	const group = screen.getByRole("radiogroup", { name: `${day} screen` });
	const radio = Array.from(
		group.querySelectorAll<HTMLInputElement>("input[type=radio]")
	).find((candidate) => candidate.value === value);
	if (!radio) throw new Error(`no ${value} option for ${day}`);
	fireEvent.click(radio);
	await waitFor(() => {
		expect(radio.checked).toBe(true);
	});
}

test("shows a row for each weekday", () => {
	renderSheet();
	expect(screen.getAllByRole("radiogroup")).toHaveLength(7);
	expect(screen.getByText("Monday")).toBeInTheDocument();
	expect(screen.getByText("Sunday")).toBeInTheDocument();
});

test("closing Saturday and saving sends only that day", async () => {
	renderSheet();
	await choose("Saturday", "closed");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:setDeviceSchedule", {
			id: "device-live",
			days: [{ day: "sat", closed: true }],
		});
	});
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("hours that end before they start show the problem and block Save", async () => {
	renderSheet();
	await choose("Monday", "hours");
	// Defaults are 08:00 to 22:00: nudge the "on" hour up past the "off" one.
	const onHour = document.querySelector<HTMLElement>('[data-type="hour"]');
	if (!onHour) throw new Error("on hour segment not found");
	onHour.focus();
	for (let step = 0; step < 15; step += 1)
		fireEvent.keyDown(onHour, { key: "ArrowUp" });
	await waitFor(() => {
		expect(
			screen.getByText("mon: on must be before off")
		).toBeInTheDocument();
	});
	expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("a time change is saved as HH:MM", async () => {
	renderSheet();
	await choose("Monday", "hours");
	const offHour =
		document.querySelectorAll<HTMLElement>('[data-type="hour"]')[1];
	offHour.focus();
	fireEvent.keyDown(offHour, { key: "ArrowDown" });
	await waitFor(() => {
		expect(offHour).toHaveAttribute("data-value", "21");
	});
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:setDeviceSchedule", {
			id: "device-live",
			days: [{ day: "mon", closed: false, on: "08:00", off: "21:00" }],
		});
	});
});

test("says hours run within one day", () => {
	renderSheet();
	expect(screen.getByText(/Hours run within one day/)).toBeInTheDocument();
});

test("Cancel closes without saving", async () => {
	renderSheet();
	await choose("Saturday", "closed");
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	expect(convexMock.mutate).not.toHaveBeenCalled();
});

test("a live update of the device while open keeps the draft", async () => {
	const [device, setDevice] = createSignal({ ...DEVICE });
	render(() => (
		<ScheduleSheet open onOpenChange={onOpenChange} device={device()} />
	));
	await choose("Saturday", "closed");
	// A listDevices refetch hands over a new object for the same device.
	setDevice({ ...DEVICE });
	await Promise.resolve();
	const group = screen.getByRole("radiogroup", { name: "Saturday screen" });
	const closed = Array.from(
		group.querySelectorAll<HTMLInputElement>("input[type=radio]")
	).find((candidate) => candidate.value === "closed");
	expect(closed?.checked).toBe(true);
});

test("a failed save's error is gone after close and reopen", async () => {
	convexMock.mutate.mockRejectedValueOnce(new Error("nope"));
	const [isOpen, setIsOpen] = createSignal(true);
	render(() => (
		<ScheduleSheet
			open={isOpen()}
			onOpenChange={setIsOpen}
			device={DEVICE}
		/>
	));
	await choose("Saturday", "closed");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(
			screen.getByText("Could not save the schedule. Try again.")
		).toBeInTheDocument();
	});
	setIsOpen(false);
	setIsOpen(true);
	await waitFor(() => {
		expect(
			screen.queryByText("Could not save the schedule. Try again.")
		).toBeNull();
	});
});
