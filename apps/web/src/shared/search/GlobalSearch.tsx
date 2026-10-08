import {
	CommandPalette,
	type CommandPaletteItem,
	IconButton,
	Input,
	Kbd,
} from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import type { Hotkey } from "@tanstack/solid-hotkeys";
import { Show, createMemo, createSignal, type JSX } from "solid-js";

import { ICONS } from "../icons.ts";
import { morph } from "../viewTransition/morph.ts";

import styles from "./GlobalSearch.module.scss";
import { SearchSources, pageItems, tabItems } from "./sources.tsx";

/** `base`, plus the shared view-transition name when `carries` is true. */
function withMorph(base: string, carries: boolean): string {
	return carries ? `${base} ${styles.morph}` : base;
}

/**
 * A header control: it carries the morph while the palette is closed, and is
 * hidden while it is open. Without the hide, the field stays in the header's
 * "after" snapshot, so the morph played on top of a second copy of the search
 * box and the palette looked duplicated.
 */
function headerControl(base: string, paletteOpen: boolean): string {
	return paletteOpen
		? `${base} ${styles.hiddenWhileOpen}`
		: withMorph(base, true);
}

/** One string, bound by the palette and rendered by the field's hint. */
const SEARCH_SHORTCUT: Hotkey = "Mod+K";

/**
 * The header's search field, and the palette behind it.
 *
 * The field is a real (read-only) input rather than a button so it carries the
 * design system's field styling and its trailing slot — but it never receives
 * typing: focusing or clicking it opens the palette, which is where the typing
 * happens. That keeps one search box on screen instead of two that behave
 * differently.
 *
 * The palette morphs out of whichever search control is on screen; see
 * `morph.ts`.
 *
 * The palette stays mounted while closed, because it owns the ⌘K binding and a
 * component that is not there cannot open itself. Its DATA sources are what
 * mount on demand, so a session that never searches opens no extra Convex
 * subscriptions.
 */
export function GlobalSearch(): JSX.Element {
	const navigate = useNavigate();
	const [open, setOpen] = createSignal(false);
	const [entities, setEntities] = createSignal<CommandPaletteItem[]>([]);

	// Order matters: it is the order a blank palette lists them in, and the
	// tie-break when several things score the same.
	const items = createMemo(() =>
		[...pageItems(navigate), ...tabItems(navigate), ...entities()].map(
			(item) => ({
				...item,
				// Run the selection only after the palette has actually closed,
				// so navigation (a drawer deep link) is not followed by the
				// modal's focus restore stealing focus back to the header.
				onSelect: () => {
					void settled.then(item.onSelect);
				},
			})
		)
	);

	// `open()` only flips inside the morph's deferred callback, so requests are
	// compared against the last one made. Callbacks run in order, so the final
	// state is the last request. Known limit: ⌘K sends `!props.open`, so a
	// second ⌘K inside the ~1-frame pending window repeats the same request and
	// is ignored.
	let target = false;
	let settled: Promise<void> = Promise.resolve();
	// Where focus was before the palette opened. Without a morph the dialog puts
	// it back on close. Inside a View Transition the palette's combobox refocuses
	// its own input a frame later, while that input is still focusable, and the
	// caret stayed in the closed palette, swallowing every keystroke.
	let opener: HTMLElement | null = null;

	function setOpenMorphing(next: boolean): void {
		if (next === target) return;
		target = next;
		if (next) {
			opener =
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
			settled = morph(() => setOpen(true));
			return;
		}
		const stranded = document.activeElement;
		settled = morph(() => setOpen(false)).then(() => {
			// Only while focus is still where the palette left it.
			if (document.activeElement === stranded) opener?.focus();
		});
	}

	return (
		<>
			<Input
				// `label=""` is falsy, so MakeField renders no <label> at all
				// and the field would reach a screen reader unnamed. The visible
				// design has no label — the magnifier and the placeholder carry
				// it — so the name goes on the control itself.
				label=""
				aria-label="Search"
				class={headerControl(styles.field, open())}
				leadingIconName={ICONS.search}
				placeholder="Search"
				readOnly
				value=""
				trailing={<Kbd shortcut={SEARCH_SHORTCUT} />}
				onClick={() => {
					setOpenMorphing(true);
				}}
				// NOT `onFocus`. Closing the palette returns focus to whatever
				// opened it — this field — which fired `onFocus` and reopened it
				// immediately, so a selected result never seemed to close
				// anything. Keyboard users get the field via Enter/Space, and
				// the shortcut works from anywhere.
				onKeyDown={(event: KeyboardEvent) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					setOpenMorphing(true);
				}}
			/>
			{/*
			 * The same control, as a button, for a narrow top bar.
			 *
			 * Squeezed beside the heading and the actions, the field became a
			 * sliver that cannot be typed into anyway — the palette is where
			 * the typing happens — so below the bar's search threshold the
			 * glyph stands in for it.
			 *
			 * Both are rendered and CSS picks one, by the bar's own width (a
			 * container query). The alternative, a JS query, means the wrong
			 * one is on screen until the first effect runs, and it would put a
			 * resize listener in the header for a decision the stylesheet
			 * already makes.
			 */}
			<IconButton
				class={headerControl(styles.compact, open())}
				tooltipLabel="Search"
				onClick={() => {
					setOpenMorphing(true);
				}}
			>
				{ICONS.search}
			</IconButton>
			<Show when={open()}>
				<SearchSources onEntities={setEntities} />
			</Show>
			<CommandPalette
				open={open()}
				onOpenChange={setOpenMorphing}
				class={withMorph(styles.palette, open())}
				shortcut={SEARCH_SHORTCUT}
				items={items()}
				placeholder="Search pages, people, tasks…"
				emptyMessage="Nothing matches that."
				recentsKey="jos:search:recents"
			/>
		</>
	);
}
