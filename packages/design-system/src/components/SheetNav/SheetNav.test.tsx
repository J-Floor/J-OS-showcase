import { render, screen, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	fakeViewTransitions,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { viewTransition } from "../../utils/viewTransition.ts";
import { SHEET_BODY } from "../Sheet/Sheet.tsx";

import { SheetNav } from "./SheetNav.tsx";

/** Records data-vt and the body's name as each transition's update starts. */
function recordTransitions(): { kinds: string[]; bodyNames: string[] } {
	const seen = { kinds: [] as string[], bodyNames: [] as string[] };
	fakeViewTransitions({
		sync: true,
		onStart: () => {
			seen.kinds.push(document.documentElement.dataset.vt ?? "");
			seen.bodyNames.push(
				document
					.querySelector<HTMLElement>(`[${SHEET_BODY}]`)
					?.style.getPropertyValue("view-transition-name") ?? "none"
			);
		},
	});
	return seen;
}

function SheetWithNav(props: { onPrev: () => void; onNext: () => void }) {
	return (
		<div data-scope="dialog" data-part="content" data-testid="panel">
			<SheetNav
				onPrev={props.onPrev}
				onNext={props.onNext}
				hasPrev
				hasNext
			/>
			<div {...{ [SHEET_BODY]: "" }} data-testid="body" />
		</div>
	);
}

afterEach(async () => {
	// A step's transition still draining would swallow the next test's step.
	await transitionSettled();
	restoreViewTransitions();
});

describe("SheetNav", () => {
	it("calls onPrev / onNext when the buttons are clicked", () => {
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<SheetNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
		));
		fireEvent.click(screen.getByRole("button", { name: /previous/i }));
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(onPrev).toHaveBeenCalledTimes(1);
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("disables the buttons when hasPrev / hasNext are false", () => {
		render(() => (
			<SheetNav
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
				<button type="button" data-testid="something-in-sheet">
					Save
				</button>
				<SheetNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const button = screen.getByTestId("something-in-sheet");
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
				<SheetNav
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
			<SheetNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
		));
		fireEvent.keyDown(document, { key: "ArrowUp" });
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(onPrev).not.toHaveBeenCalled();
		expect(onNext).not.toHaveBeenCalled();
	});

	it("arrows do nothing while typing in a field inside the sheet", () => {
		const onPrev = vi.fn(),
			onNext = vi.fn();
		render(() => (
			<div data-scope="dialog" data-part="content">
				<input data-testid="field-in-sheet" />
				<SheetNav onPrev={onPrev} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const field = screen.getByTestId("field-in-sheet");
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
				<SheetNav onPrev={() => {}} onNext={onNext} hasPrev hasNext />
			</div>
		));
		const panel = screen.getByTestId("panel");
		fireEvent.keyDown(panel, { key: "ArrowDown" });
		fireEvent.keyDown(panel, { key: "ArrowDown", repeat: true });
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("next and previous run as sheet-next and sheet-prev transitions on the body", async () => {
		const seen = recordTransitions();
		const onNext = vi.fn();
		const onPrev = vi.fn();
		render(() => <SheetWithNav onPrev={onPrev} onNext={onNext} />);
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		await vi.waitFor(() => {
			expect(onNext).toHaveBeenCalledTimes(1);
			expect(document.documentElement.dataset.vt).toBeUndefined();
		});
		fireEvent.click(screen.getByRole("button", { name: /previous/i }));
		await vi.waitFor(() => {
			expect(onPrev).toHaveBeenCalledTimes(1);
		});
		expect(seen.kinds).toEqual(["sheet-next", "sheet-prev"]);
		expect(seen.bodyNames).toEqual(["jf-sheet-body", "jf-sheet-body"]);
	});

	it("an arrow key steps inside a sheet-next transition too", async () => {
		const seen = recordTransitions();
		const onNext = vi.fn();
		render(() => <SheetWithNav onPrev={() => {}} onNext={onNext} />);
		fireEvent.keyDown(screen.getByTestId("panel"), { key: "ArrowDown" });
		await vi.waitFor(() => {
			expect(onNext).toHaveBeenCalledTimes(1);
		});
		expect(seen.kinds).toEqual(["sheet-next"]);
		expect(seen.bodyNames).toEqual(["jf-sheet-body"]);
	});

	it("a step while the sheet is still morphing open leaves the body unnamed", async () => {
		recordTransitions();
		const onNext = vi.fn();
		render(() => <SheetWithNav onPrev={() => {}} onNext={onNext} />);
		const body = screen.getByTestId("body");
		let bodyName: string | undefined;
		await viewTransition(
			() => {
				fireEvent.click(screen.getByRole("button", { name: /next/i }));
				bodyName = body.style.getPropertyValue("view-transition-name");
			},
			{ kind: "morph" }
		);
		expect(onNext).toHaveBeenCalledTimes(1);
		expect(bodyName).toBe("");
	});
});
