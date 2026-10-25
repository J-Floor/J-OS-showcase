// @vitest-environment happy-dom
import { createSaveTracker } from "@j-os/design-system";
import { type ResultAsync, errAsync, okAsync } from "neverthrow";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ClientError } from "./call.ts";
import { createSyncedField } from "./createSyncedField.ts";

const { toasterCreate } = vi.hoisted(() => ({ toasterCreate: vi.fn() }));
vi.mock("../shared/toaster.ts", () => ({
	toaster: { create: toasterCreate },
}));

const DEBOUNCE_MS = 400;
const REFUSED: ClientError = { code: "Unknown", message: "Could not save." };

type Write = (value: string) => ResultAsync<unknown, ClientError>;

function saved(): ResultAsync<unknown, ClientError> {
	return okAsync(null);
}

function refused(): ResultAsync<unknown, ClientError> {
	return errAsync(REFUSED);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	toasterCreate.mockReset();
});

/** A title field on an open sheet, reporting to its own tracker. */
function titleField(write: Write) {
	return createRoot((dispose) => {
		const tracker = createSaveTracker();
		const [open, setOpen] = createSignal(true);
		const field = createSyncedField({
			remote: () => "",
			key: () => String(open()),
			open,
			tracker,
			write,
			debounceMs: DEBOUNCE_MS,
		});
		return { field, tracker, setOpen, dispose };
	});
}

test("a typed value is pending until its write resolves, then saved", async () => {
	const { field, tracker } = titleField(saved);
	field.set("Drill");
	expect(tracker.state()).toBe("pending");
	await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
	expect(tracker.state()).toBe("saved");
});

test("a refused write is failed; Retry sends the last value again", async () => {
	const write = vi
		.fn<Write>()
		.mockReturnValueOnce(refused())
		.mockReturnValue(saved());
	const { field, tracker } = titleField(write);
	field.set("Dril");
	field.set("Drill");
	field.flush();
	await vi.advanceTimersByTimeAsync(0);
	expect(tracker.state()).toBe("failed");
	tracker.retry();
	await vi.advanceTimersByTimeAsync(0);
	expect(write).toHaveBeenLastCalledWith("Drill");
	expect(write).toHaveBeenCalledTimes(2);
	expect(tracker.state()).toBe("saved");
});

test("closing sends a waiting write at once instead of dropping it", () => {
	const write = vi.fn<Write>(saved);
	const { field, setOpen } = titleField(write);
	field.set("Drill");
	setOpen(false);
	expect(write).toHaveBeenCalledWith("Drill");
});

test("a write that sends nothing (no row yet) leaves nothing pending", async () => {
	const { field, tracker } = createRoot(() => {
		const tracker = createSaveTracker();
		const field = createSyncedField({
			remote: () => "",
			key: () => "new",
			tracker,
			write: () => {},
			debounceMs: DEBOUNCE_MS,
		});
		return { field, tracker };
	});
	field.set("Drill");
	await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
	expect(tracker.state()).toBe("idle");
});

test("a write failing after its sheet closed toasts; one failing while open does not", async () => {
	const { field, setOpen } = titleField(refused);
	field.set("Drill");
	field.flush();
	await vi.advanceTimersByTimeAsync(0);
	expect(toasterCreate).not.toHaveBeenCalled();
	field.set("Drills");
	setOpen(false);
	await vi.advanceTimersByTimeAsync(0);
	expect(toasterCreate).toHaveBeenCalledWith({
		type: "error",
		title: REFUSED.message,
	});
});
