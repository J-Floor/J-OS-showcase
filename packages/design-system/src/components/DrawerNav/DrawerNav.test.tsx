import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { DrawerNav } from "./DrawerNav.tsx";

describe("DrawerNav", () => {
	it("calls onPrev / onNext when the buttons are clicked", () => {
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<DrawerNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
		));
		fireEvent.click(screen.getByRole("button", { name: /previous/i }));
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(onPrev).toHaveBeenCalledTimes(1);
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("disables the buttons when hasPrev / hasNext are false", () => {
		render(() => (
			<DrawerNav
				onPrev={() => {}}
				onNext={() => {}}
				hasPrev={false}
				hasNext={false}
			/>
		));
		expect(
			screen.getByRole("button", { name: /previous/i })
		).toBeDisabled();
		expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
	});

	it("ArrowUp/ArrowDown call onPrev/onNext when the event bubbles up from inside the ancestor dialog panel", () => {
		// Dispatched on a non-typing-target descendant (a button, not an input) —
		// this is proving the SCOPING (bubbling up to the panel from somewhere
		// inside it), not the typing guard, which has its own test below.
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<div data-scope="dialog" data-part="content">
				<button type="button" data-testid="something-in-drawer">
					Save
				</button>
				<DrawerNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const button = screen.getByTestId("something-in-drawer");
		fireEvent.keyDown(button, { key: "ArrowUp" });
		fireEvent.keyDown(button, { key: "ArrowDown" });
		expect(onPrev).toHaveBeenCalledTimes(1);
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("ArrowUp/ArrowDown respect hasPrev/hasNext", () => {
		// Dispatched on the panel itself, not `document` — the registration's
		// target is the panel, and a keydown dispatched directly at `document`
		// never bubbles DOWN into it.
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<div data-scope="dialog" data-part="content" data-testid="panel">
				<DrawerNav
					onPrev={onPrev}
					onNext={onNext}
					hasPrev={false}
					hasNext={false}
				/>
			</div>
		));
		const panel = screen.getByTestId("panel");
		fireEvent.keyDown(panel, { key: "ArrowUp" });
		fireEvent.keyDown(panel, { key: "ArrowDown" });
		expect(onPrev).not.toHaveBeenCalled();
		expect(onNext).not.toHaveBeenCalled();
	});

	it("ArrowUp/ArrowDown do nothing when there is no ancestor dialog panel to scope to", () => {
		// No `[data-scope="dialog"][data-part="content"]` ancestor: the target
		// resolves to `undefined`, and `createHotkey` skips registering rather
		// than falling back to `document` — this component must never bind an
		// unscoped arrow key, which is exactly the collision it exists to avoid.
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<DrawerNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
		));
		fireEvent.keyDown(document, { key: "ArrowUp" });
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(onPrev).not.toHaveBeenCalled();
		expect(onNext).not.toHaveBeenCalled();
	});

	it("arrows do nothing while typing in a field inside the drawer", () => {
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<div data-scope="dialog" data-part="content">
				<input data-testid="field-in-drawer" />
				<DrawerNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const field = screen.getByTestId("field-in-drawer");
		// Not preventDefaulted either — a text field's own caret movement must
		// survive.
		expect(fireEvent.keyDown(field, { key: "ArrowUp" })).toBe(true);
		expect(fireEvent.keyDown(field, { key: "ArrowDown" })).toBe(true);
		expect(onPrev).not.toHaveBeenCalled();
		expect(onNext).not.toHaveBeenCalled();
	});

	it("a held arrow key fires once", () => {
		const onNext = vi.fn();
		render(() => (
			<div data-scope="dialog" data-part="content" data-testid="panel">
				<DrawerNav onPrev={() => {}} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const panel = screen.getByTestId("panel");
		fireEvent.keyDown(panel, { key: "ArrowDown" });
		fireEvent.keyDown(panel, { key: "ArrowDown", repeat: true });
		expect(onNext).toHaveBeenCalledTimes(1);
	});
});
