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

import styles from "./GlobalSearch.module.scss";
import { SearchSources, pageItems, tabItems } from "./sources.tsx";

/** One string, bound by the palette and rendered by the field's hint. */
const SEARCH_SHORTCUT: Hotkey = "Mod+K";

function SearchField(props: {
	class: string;
	onOpen: () => void;
	setRoot: (element: HTMLElement) => void;
}): JSX.Element {
	return (
		<Input
			rootRef={props.setRoot}
			// `label=""` is falsy, so MakeField renders no <label> at all
			// and the field would reach a screen reader unnamed. The visible
			// design has no label — the magnifier and the placeholder carry
			// it — so the name goes on the control itself.
			label=""
			aria-label="Search"
			class={props.class}
			leadingIconName={ICONS.search}
			placeholder="Search"
			readOnly
			value=""
			trailing={<Kbd shortcut={SEARCH_SHORTCUT} />}
			onClick={() => {
				props.onOpen();
			}}
			// NOT `onFocus`. Closing the palette returns focus to whatever
			// opened it — this field — which fired `onFocus` and reopened it
			// immediately, so a selected result never seemed to close
			// anything. Keyboard users get the field via Enter/Space, and
			// the shortcut works from anywhere.
			onKeyDown={(event: KeyboardEvent) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				props.onOpen();
			}}
		/>
	);
}

/**
 * The header's search field, and the palette behind it.
 *
 * The field is a real (read-only) input rather than a button so it carries the
 * design system's field styling and its trailing slot — but it never receives
 * typing: focusing or clicking it opens the palette, which is where the typing
 * happens. That keeps one search box on screen instead of two that behave
 * differently.
 *
 * The palette morphs out of whichever search control was clicked; the design
 * system's `Dialog` does that. ⌘K clicks nothing, so it opens out of whichever
 * control is on screen.
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
	const items = createMemo(() => [
		...pageItems(navigate),
		...tabItems(navigate),
		...entities(),
	]);

	let field: HTMLElement | undefined;
	let compact: HTMLElement | undefined;

	return (
		<>
			<SearchField
				class={styles.field}
				setRoot={(element) => {
					field = element;
				}}
				onOpen={() => {
					setOpen(true);
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
				ref={(element: HTMLElement) => {
					compact = element;
				}}
				class={styles.compact}
				tooltipLabel="Search"
				onClick={() => {
					setOpen(true);
				}}
			>
				{ICONS.search}
			</IconButton>
			<Show when={open()}>
				<SearchSources onEntities={setEntities} />
			</Show>
			<CommandPalette
				open={open()}
				onOpenChange={setOpen}
				morphFrom={() => [field, compact]}
				shortcut={SEARCH_SHORTCUT}
				items={items()}
				placeholder="Search pages, people, tasks…"
				emptyMessage="Nothing matches that."
				recentsKey="jos:search:recents"
			/>
		</>
	);
}
