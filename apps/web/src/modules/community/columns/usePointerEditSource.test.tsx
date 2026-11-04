// @vitest-environment happy-dom
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { usePointerEditSource } from "./usePointerEditSource.ts";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

function mountSource() {
	const onScrubberRelease = vi.fn();
	const read: { current: (() => "scrubber" | "button" | null) | undefined } =
		{ current: undefined };
	render(() => {
		read.current = usePointerEditSource(onScrubberRelease);
		return (
			<div>
				<span data-part="scrubber" data-testid="scrubber">
					<i data-testid="scrubber-inner" />
				</span>
				<button aria-label="Increment" data-testid="inc" />
				<button aria-label="Decrement" data-testid="dec" />
				<input data-testid="field" />
			</div>
		);
	});
	return { onScrubberRelease, source: () => read.current?.() ?? null };
}

function target(id: string): Element {
	const element = document.querySelector(`[data-testid="${id}"]`);
	if (!element) throw new Error(id);
	return element;
}

function press(id: string): void {
	target(id).dispatchEvent(new Event("pointerdown", { bubbles: true }));
}
function release(id: string): void {
	target(id).dispatchEvent(new Event("pointerup", { bubbles: true }));
}

test("a press on the scrubber, or inside it, is a scrubber edit", () => {
	const { source } = mountSource();
	press("scrubber");
	expect(source()).toBe("scrubber");
	press("scrubber-inner");
	expect(source()).toBe("scrubber");
});

test("a press on the increment or decrement button is a button edit", () => {
	const { source } = mountSource();
	press("inc");
	expect(source()).toBe("button");
	press("dec");
	expect(source()).toBe("button");
});

test("a press anywhere else is neither, so typing stays deferred", () => {
	const { source } = mountSource();
	press("scrubber");
	press("field");
	expect(source()).toBeNull();
});

test("releasing a scrubber drag reports it once and resets the source", () => {
	const { source, onScrubberRelease } = mountSource();
	press("scrubber");
	release("scrubber");
	expect(onScrubberRelease).toHaveBeenCalledTimes(1);
	expect(source()).toBeNull();
	release("scrubber");
	expect(onScrubberRelease).toHaveBeenCalledTimes(1);
});

test("releasing after a button press does not report a scrubber release but resets the source", () => {
	const { source, onScrubberRelease } = mountSource();
	press("inc");
	release("inc");
	expect(onScrubberRelease).not.toHaveBeenCalled();
	expect(source()).toBeNull();
});
