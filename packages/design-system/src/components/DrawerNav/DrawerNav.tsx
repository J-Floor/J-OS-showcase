import { createHotkey } from "@tanstack/solid-hotkeys";
import { createSignal, onMount, type JSX } from "solid-js";

import { isTypingTarget } from "../../utils/typingTarget.ts";
import { IconButton } from "../IconButton/IconButton.tsx";

import styles from "./DrawerNav.module.scss";

/**
 * Prev/next arrows for a Drawer header (placed in the `headerAction` slot).
 *
 * ArrowUp/ArrowDown here are scoped to the open drawer panel. `Table` keeps
 * its own ArrowUp/ArrowDown for the roster's row-focus ring, but only while the
 * table itself has focus, so the two never see the same keystroke: with a
 * drawer open the ring is pinned and inert, and focus is in the drawer. The
 * scoping is the library's own target option: a hotkey registered with
 * `target: <element>` only matches while that element or something inside it
 * has focus, and it `stopPropagation`s by default.
 *
 * The target is the whole open drawer panel (Ark's `Dialog.Content`), not just
 * this component's own two buttons — focus can be anywhere inside the drawer
 * (a field being edited, the decision bar) when the arrow is pressed, and all
 * of that has to be in scope. `Drawer` already renders that panel with
 * `role="dialog"`, the same landmark `isTypingTarget` keys off of for "is this
 * inside an open overlay", so this walks up to it via `closest` from a ref on
 * this component's own root rather than Drawer having to thread the element
 * down as a prop — Drawer stays generic (it does not otherwise know it is
 * hosting nav arrows at all), and nothing else in the tree needs to change to
 * give DrawerNav what it needs.
 */
export function DrawerNav(props: {
	onPrev: () => void;
	onNext: () => void;
	hasPrev: boolean;
	hasNext: boolean;
}): JSX.Element {
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={anchorRef}` binding below, which the rule can't see
	let anchorRef: HTMLDivElement | undefined;
	const [drawerEl, setDrawerEl] = createSignal<HTMLElement>();
	onMount(() => {
		setDrawerEl(
			anchorRef?.closest<HTMLElement>(
				'[data-scope="dialog"][data-part="content"]'
			) ?? undefined
		);
	});

	function guarded(action: () => void) {
		return (event: KeyboardEvent) => {
			if (event.repeat || isTypingTarget(event.target)) return;
			event.preventDefault();
			action();
		};
	}

	// `ignoreInputs: false`: the library's own typing guard compares the
	// FOCUSED element against the registration's `target` — and that target is
	// the whole drawer panel, never the exact field someone is typing in, so
	// every keystroke inside an editable field would count as "not the
	// registration target" and get silently swallowed before `guarded` ever
	// ran. `isTypingTarget` is the one gate that is actually meant to decide
	// this.
	//
	// `preventDefault: false`: a letter/arrow that only steps a drawer has no
	// native browser behaviour worth cancelling on match, and cancelling it
	// early (before `guarded` gets to run `isTypingTarget`) would swallow the
	// same keystroke inside a field being edited in this drawer.
	//
	// `stopPropagation` is left at its default `true`: an arrow that steps the
	// drawer should not also bubble to anything behind it.
	createHotkey(
		"ArrowUp",
		guarded(() => {
			props.onPrev();
		}),
		() => ({
			target: drawerEl(),
			enabled: props.hasPrev,
			ignoreInputs: false,
			preventDefault: false,
		})
	);
	createHotkey(
		"ArrowDown",
		guarded(() => {
			props.onNext();
		}),
		() => ({
			target: drawerEl(),
			enabled: props.hasNext,
			ignoreInputs: false,
			preventDefault: false,
		})
	);

	return (
		<div class={styles.nav} ref={anchorRef}>
			<IconButton
				tooltipLabel="Previous"
				shortcut="ArrowUp"
				disabled={!props.hasPrev}
				disabledReason="No previous item"
				onClick={() => {
					props.onPrev();
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
					props.onNext();
				}}
			>
				expand_more
			</IconButton>
		</div>
	);
}
