import { createHotkey } from "@tanstack/solid-hotkeys";
import { createSignal, onMount, type JSX } from "solid-js";

import { isTypingTarget } from "../../utils/typingTarget.ts";
import {
	isTransitionRunning,
	viewTransition,
} from "../../utils/viewTransition.ts";
import { IconButton } from "../IconButton/IconButton.tsx";
import { SHEET_BODY } from "../Sheet/Sheet.tsx";

import styles from "./SheetNav.module.scss";

function guarded(action: () => void) {
	return (event: KeyboardEvent) => {
		if (event.repeat || isTypingTarget(event.target)) return;
		event.preventDefault();
		action();
	};
}

/**
 * Steps the sheet inside a transition: the body slides, the header stays.
 * While the sheet is still morphing open the step joins that morph, and a
 * named body would punch a hole in the morphing card, so it stays unnamed.
 */
function step(
	sheet: HTMLElement | undefined,
	kind: "sheet-next" | "sheet-prev",
	action: () => void
): void {
	const body = isTransitionRunning("morph")
		? undefined
		: (sheet?.querySelector<HTMLElement>(`[${SHEET_BODY}]`) ?? undefined);
	void viewTransition(action, {
		kind,
		names: body ? [[body, "jf-sheet-body"]] : [],
	});
}

/**
 * Prev/next arrows for a Sheet header (placed in the `headerAction` slot).
 *
 * ArrowUp/ArrowDown here are scoped to the open sheet panel. `Table` keeps
 * its own ArrowUp/ArrowDown for the roster's row-focus ring, but only while the
 * table itself has focus, so the two never see the same keystroke: with a
 * sheet open the ring is pinned and inert, and focus is in the sheet. The
 * scoping is the library's own target option: a hotkey registered with
 * `target: <element>` only matches while that element or something inside it
 * has focus, and it `stopPropagation`s by default.
 *
 * The target is the whole open sheet panel (Ark's `Dialog.Content`), not just
 * this component's own two buttons — focus can be anywhere inside the sheet
 * (a field being edited, the decision bar) when the arrow is pressed, and all
 * of that has to be in scope. `Sheet` already renders that panel with
 * `role="dialog"`, the same landmark `isTypingTarget` keys off of for "is this
 * inside an open overlay", so this walks up to it via `closest` from a ref on
 * this component's own root rather than Sheet having to thread the element
 * down as a prop — Sheet stays generic (it does not otherwise know it is
 * hosting nav arrows at all), and nothing else in the tree needs to change to
 * give SheetNav what it needs.
 */
export function SheetNav(props: {
	onPrev: () => void;
	onNext: () => void;
	hasPrev: boolean;
	hasNext: boolean;
}): JSX.Element {
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={anchorReference}` binding below, which the rule can't see
	let anchorReference: HTMLDivElement | undefined;
	const [sheetElement, setSheetElement] = createSignal<HTMLElement>();
	onMount(() => {
		setSheetElement(
			anchorReference?.closest<HTMLElement>(
				'[data-scope="dialog"][data-part="content"]'
			) ?? undefined
		);
	});

	// `ignoreInputs: false`: the library's own typing guard compares the
	// FOCUSED element against the registration's `target` — and that target is
	// the whole sheet panel, never the exact field someone is typing in, so
	// every keystroke inside an editable field would count as "not the
	// registration target" and get silently swallowed before `guarded` ever
	// ran. `isTypingTarget` is the one gate that is actually meant to decide
	// this.
	//
	// `preventDefault: false`: a letter/arrow that only steps a sheet has no
	// native browser behaviour worth cancelling on match, and cancelling it
	// early (before `guarded` gets to run `isTypingTarget`) would swallow the
	// same keystroke inside a field being edited in this sheet.
	//
	// `stopPropagation` is left at its default `true`: an arrow that steps the
	// sheet should not also bubble to anything behind it.
	createHotkey(
		"ArrowUp",
		guarded(() => {
			step(sheetElement(), "sheet-prev", props.onPrev);
		}),
		() => ({
			target: sheetElement(),
			enabled: props.hasPrev,
			ignoreInputs: false,
			preventDefault: false,
		})
	);
	createHotkey(
		"ArrowDown",
		guarded(() => {
			step(sheetElement(), "sheet-next", props.onNext);
		}),
		() => ({
			target: sheetElement(),
			enabled: props.hasNext,
			ignoreInputs: false,
			preventDefault: false,
		})
	);

	return (
		<div class={styles.nav} ref={anchorReference}>
			<IconButton
				tooltipLabel="Previous"
				shortcut="ArrowUp"
				disabled={!props.hasPrev}
				disabledReason="No previous item"
				onClick={() => {
					step(sheetElement(), "sheet-prev", props.onPrev);
				}}
			>
				expand_less
			</IconButton>
			<IconButton
				tooltipLabel="Next"
				shortcut="ArrowDown"
				disabled={!props.hasNext}
				disabledReason="No next item"
				onClick={() => {
					step(sheetElement(), "sheet-next", props.onNext);
				}}
			>
				expand_more
			</IconButton>
		</div>
	);
}
