import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
	SAVED_VISIBLE_MS,
	type SaveTracker,
	useSaveTracker,
} from "../../utils/saveTracker.ts";

import { Sheet } from "./Sheet.tsx";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** An open sheet with a save status; returns its tracker. */
function renderSheet(): SaveTracker {
	let tracker: SaveTracker | undefined;
	function Grab() {
		tracker = useSaveTracker();
		return null;
	}
	render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<Sheet.Header>
				<Sheet.Title>Item</Sheet.Title>
				<Sheet.HeaderActions>
					<Sheet.SaveStatus />
				</Sheet.HeaderActions>
			</Sheet.Header>
			<Grab />
		</Sheet.Root>
	));
	if (!tracker) throw new Error("Sheet.Root provides no tracker");
	return tracker;
}

function status(): HTMLElement {
	return screen.getByRole("status", { name: "Save status" });
}

test("nothing shows before the first write", () => {
	renderSheet();
	expect(status()).toHaveTextContent("");
	expect(status()).toHaveAttribute("data-state", "idle");
});

test("it says Saving… while a field waits, then Changes saved, then fades", async () => {
	const tracker = renderSheet();
	const field = tracker.track("title");
	field.pending();
	expect(status()).toHaveTextContent("Saving…");
	field.settle(Promise.resolve(), () => {});
	await vi.advanceTimersByTimeAsync(0);
	expect(status()).toHaveTextContent("Changes saved");
	expect(status()).toHaveAttribute("data-state", "saved");
	await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS);
	// The label stays while it fades out.
	expect(status()).toHaveTextContent("Changes saved");
	expect(status()).toHaveAttribute("data-state", "idle");
});

test("a failed write says Couldn't save, with a Retry that re-sends it", async () => {
	const tracker = renderSheet();
	const retry = vi.fn();
	const field = tracker.track("title");
	field.pending();
	field.settle(Promise.reject(new Error("offline")), retry);
	await vi.advanceTimersByTimeAsync(0);
	expect(status()).toHaveTextContent("Couldn't save");
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	expect(retry).toHaveBeenCalledOnce();
});

test("idle takes no space once the fade ends, and the next write shows it again", async () => {
	const tracker = renderSheet();
	// jsdom loads no stylesheet: give the status its fade.
	status().style.transitionDuration = "0.2s";
	// Nothing said yet: nothing laid out.
	expect(status()).toHaveAttribute("data-collapsed");
	const field = tracker.track("title");
	field.pending();
	expect(status()).not.toHaveAttribute("data-collapsed");
	field.settle(Promise.resolve(), () => {});
	await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS);
	// Faded to idle, but the fade has not ended: the label still has room.
	expect(status()).toHaveAttribute("data-state", "idle");
	expect(status()).not.toHaveAttribute("data-collapsed");
	fireEvent.transitionEnd(status(), { propertyName: "opacity" });
	expect(status()).toHaveAttribute("data-collapsed");
	field.pending();
	expect(status()).not.toHaveAttribute("data-collapsed");
});

test("with no fade to wait for (reduced motion), idle collapses at once", async () => {
	const tracker = renderSheet();
	status().style.transitionDuration = "0s";
	const field = tracker.track("title");
	field.pending();
	field.settle(Promise.resolve(), () => {});
	await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS);
	expect(status()).toHaveAttribute("data-state", "idle");
	expect(status()).toHaveAttribute("data-collapsed");
});

test("a transition ending while a write shows does not collapse it", () => {
	const tracker = renderSheet();
	tracker.track("title").pending();
	fireEvent.transitionEnd(status(), { propertyName: "opacity" });
	expect(status()).not.toHaveAttribute("data-collapsed");
});

test("outside a sheet it renders nothing", () => {
	const { container } = render(() => <Sheet.SaveStatus />);
	expect(container).toBeEmptyDOMElement();
});
