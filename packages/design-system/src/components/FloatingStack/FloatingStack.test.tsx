import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { FLOATING_STACK_SIZE_VAR, FloatingStack } from "./FloatingStack.tsx";

/** A ResizeObserver whose callback a test fires by hand. */
function fakeResizeObserver() {
	const observers: (() => void)[] = [];
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				observers.push(callback);
			}
			observe() {}
			disconnect = disconnect;
		}
	);
	return {
		resize: () => {
			for (const callback of observers) callback();
		},
		disconnect,
	};
}

/** The stack's height, as laid out. */
function stackHeight(height: number): void {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		height,
	} as DOMRect);
}

function room(): string {
	return document.documentElement.style.getPropertyValue(
		FLOATING_STACK_SIZE_VAR
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("its children stack in order", () => {
	render(() => (
		<FloatingStack>
			<p>first</p>
			<p>second</p>
		</FloatingStack>
	));
	const first = screen.getByText("first");
	expect(
		first.compareDocumentPosition(screen.getByText("second")) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("publishes the room it takes while it holds anything", () => {
	const observer = fakeResizeObserver();
	render(() => (
		<FloatingStack>
			<p>pill</p>
		</FloatingStack>
	));
	stackHeight(48);
	observer.resize();
	expect(room()).toBe("48px");
	stackHeight(0);
	observer.resize();
	expect(room()).toBe("");
});

test("clears the room when it goes", () => {
	const observer = fakeResizeObserver();
	const { unmount } = render(() => (
		<FloatingStack>
			<p>pill</p>
		</FloatingStack>
	));
	stackHeight(48);
	observer.resize();
	unmount();
	expect(observer.disconnect).toHaveBeenCalled();
	expect(room()).toBe("");
});
