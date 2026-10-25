// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskActions } from "../data/tasksData.tsx";

import {
	createBulkDelete,
	createMarqueeSelection,
} from "./kanbanInteraction.ts";

function press(
	key: string,
	target: EventTarget = document.body
): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(event);
	return event;
}

let dispose: (() => void) | undefined;

function setup(selected: string[]) {
	return createRoot((done) => {
		dispose = done;
		const selection = createMarqueeSelection();
		selection.setSelected(new Set(selected));
		return createBulkDelete({
			selection,
			actions: { remove: vi.fn() } as unknown as TaskActions,
		});
	});
}

describe("createBulkDelete", () => {
	afterEach(() => {
		dispose?.();
		dispose = undefined;
		document.body.innerHTML = "";
	});

	it.each(["Backspace", "Delete"])(
		"%s with cards selected asks to confirm",
		(key) => {
			const bulk = setup(["a"]);
			const event = press(key);
			expect(bulk.confirmOpen()).toBe(true);
			expect(event.defaultPrevented).toBe(true);
		}
	);

	it("does nothing with no card selected", () => {
		const bulk = setup([]);
		const event = press("Backspace");
		expect(bulk.confirmOpen()).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	it("leaves Backspace to a focused text field", () => {
		const bulk = setup(["a"]);
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		const event = press("Backspace", input);
		expect(bulk.confirmOpen()).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	it("does nothing while a dialog is open", () => {
		const bulk = setup(["a"]);
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		dialog.dataset.state = "open";
		document.body.append(dialog);
		const event = press("Delete");
		expect(bulk.confirmOpen()).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	it("stops listening with its owner", () => {
		const bulk = setup(["a"]);
		dispose?.();
		dispose = undefined;
		press("Backspace");
		expect(bulk.confirmOpen()).toBe(false);
	});
});
