import { createListCollection } from "@ark-ui/solid/combobox";
import { createHotkey, type Hotkey } from "@tanstack/solid-hotkeys";
import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	type Accessor,
} from "solid-js";

import { MORPH_FROM } from "../../utils/morphPresence.ts";
import { viewTransition } from "../../utils/viewTransition.ts";

import {
	addRecent,
	readRecents,
	scoreMatch,
	writeRecents,
} from "./CommandPalette.helpers.ts";
import type {
	CommandPaletteItem,
	CommandPaletteProps,
} from "./CommandPalette.tsx";

const HIGHLIGHT_INTENT_MS = 120;

const DEFAULT_MAX_RECENTS = 5;
const DEFAULT_MAX_PER_GROUP = 8;
const RECENT_GROUP = "Recent";

/** One heading's rows, and how many matched before the cap. */
export type PaletteGroup = {
	name: string;
	items: CommandPaletteItem[];
	total: number;
};

/** The ranked, recent-pinned, capped groups, and the flat collection Ark
 *  drives the highlight off. */
export function createPaletteResults(
	props: Pick<
		CommandPaletteProps,
		"items" | "recentsKey" | "maxRecents" | "maxPerGroup"
	>,
	search: Accessor<string>,
	recents: Accessor<string[]>
) {
	function maxRecents(): number {
		return props.maxRecents ?? DEFAULT_MAX_RECENTS;
	}

	function maxPerGroup(): number {
		return props.maxPerGroup ?? DEFAULT_MAX_PER_GROUP;
	}

	function searching(): boolean {
		return search().trim() !== "";
	}

	/**
	 * Matching items, best first. A blank search keeps the caller's order —
	 * `scoreMatch` gives everything 1, and a stable sort leaves them be — and
	 * shows only the fixed destinations, since `searchOnly` items are what you
	 * go looking for rather than what you browse.
	 */
	const ranked = createMemo(() => {
		const term = search();
		const isOpen = searching();
		return props.items
			.filter((item) => isOpen || item.searchOnly !== true)
			.map((item, index) => ({
				item,
				index,
				score: scoreMatch(item.label, term, item.keywords),
			}))
			.filter((scored) => scored.score > 0)
			.sort(
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				(a, b) => b.score - a.score || a.index - b.index
			)
			.map((scored) => scored.item);
	});

	/**
	 * What was used last, shown only on a blank search. Once you have typed
	 * something you are looking for that thing, not for your own history — and
	 * a Recent copy of an item that also matches would list it twice.
	 */
	const recentItems = createMemo(() => {
		if (searching() || props.recentsKey === undefined) return [];
		const byValue = new Map(props.items.map((item) => [item.value, item]));
		return recents()
			.map((value) => byValue.get(value))
			.filter((item): item is CommandPaletteItem => item !== undefined)
			.slice(0, maxRecents());
	});

	/**
	 * Groups in first-seen order, with Recent pinned to the top, each capped at
	 * `maxPerGroup` and carrying its full count so the heading can own up to what
	 * it left out.
	 *
	 * A recent is the SAME item as its entry further down, so it is removed from
	 * its own group rather than shown twice. Ark keys rows by value: a duplicate
	 * would highlight both copies at once, and arrowing down would appear to
	 * stall as the highlight moved between two identical rows.
	 */
	const groups = createMemo(() => {
		const recentValues = recentItems();
		const pinned = new Set(recentValues.map((item) => item.value));
		const all = [
			...recentValues,
			...ranked().filter((item) => !pinned.has(item.value)),
		];

		const out: {
			name: string;
			items: CommandPaletteItem[];
			total: number;
		}[] = [];
		const byName = new Map<string, (typeof out)[number]>();
		for (const item of all) {
			const name = pinned.has(item.value) ? RECENT_GROUP : item.group;
			let bucket = byName.get(name);
			if (!bucket) {
				bucket = { name, items: [], total: 0 };
				byName.set(name, bucket);
				out.push(bucket);
			}
			bucket.total++;
			if (bucket.items.length < maxPerGroup()) bucket.items.push(item);
		}
		return out;
	});

	/**
	 * Every row actually on screen, in the order the keyboard walks it.
	 *
	 * Derived from the CAPPED groups, not from the full match list: Ark drives
	 * the highlight off the collection, so an item the collection knows about but
	 * the list never rendered is a stop the arrow keys make on nothing.
	 */
	const visible = createMemo(() => groups().flatMap((group) => group.items));

	// One flat collection, in the same order as the groups above, so arrowing
	// down moves the highlight the way the eye reads.
	const collection = createMemo(() =>
		createListCollection({
			items: visible(),
			itemToValue: (item) => item.value,
			itemToString: (item) => item.label,
		})
	);

	return { groups, visible, collection };
}

/** The highlighted row, kept on screen as it moves. */
export function createHighlight(visible: Accessor<CommandPaletteItem[]>) {
	/**
	 * The first row is highlighted, so Enter opens the obvious answer without
	 * arrowing to it first — the whole point of typing into a palette. Ark has
	 * no `autoHighlight` in this version, so the highlight is controlled here
	 * and re-pointed at the top of the list whenever the list changes.
	 */
	const [highlighted, setHighlighted] = createSignal<string | null>(null);
	createEffect(() => {
		setHighlighted(visible().at(0)?.value ?? null);
	});

	/**
	 * Keep the highlighted row on screen.
	 *
	 * zag scrolls it itself — but only inside `Combobox.Content`, and this
	 * palette renders `Combobox.List` (see the note at the list below). Its
	 * helper bails on a missing root element rather than falling back to the
	 * nearest scroller, so arrowing past the bottom row silently moved the
	 * highlight off-screen and the list never followed.
	 *
	 * `block: "nearest"` scrolls only when the row is actually out of view, so
	 * hovering — which also moves the highlight — never yanks the list.
	 *
	 * The first row is special-cased to a plain `scrollTop = 0`, for two
	 * reasons. It is more correct — a heading sits above that row and is not
	 * part of it, so `scrollIntoView` will happily leave it clipped. And it is
	 * measurement-free: asked to scroll the first row into view while the
	 * dialog was still animating in, the browser measured a rect that the
	 * animation had displaced and scrolled the list by that displacement,
	 * opening the palette already scrolled past its own first result. Only on
	 * the first open after a reload, and only with enough results to scroll —
	 * which is why it showed up in production and not on a dev roster.
	 */
	let listReference: HTMLElement | undefined;
	function rowFor(value: string): HTMLElement | null {
		return (
			listReference?.querySelector<HTMLElement>(
				`[role="option"][data-value="${CSS.escape(value)}"]`
			) ?? null
		);
	}
	createEffect(() => {
		const value = highlighted();
		if (value === null) return;
		const isFirst = visible().at(0)?.value === value;
		// Deferred: when the highlight moves because the LIST changed, the row
		// it points at is rendered by the same pass this effect runs in, and is
		// not in the DOM yet when the effect fires.
		queueMicrotask(() => {
			if (!listReference) return;
			if (isFirst) {
				listReference.scrollTop = 0;
				return;
			}
			const row = rowFor(value);
			// jsdom does no layout and ships no `scrollIntoView`, so a test
			// environment must not be the thing that throws here.
			if (typeof row?.scrollIntoView === "function")
				row.scrollIntoView({ block: "nearest" });
		});
	});

	function setListReference(element: HTMLElement): void {
		listReference = element;
	}

	return { highlighted, setHighlighted, setListReference, rowFor };
}

/**
 * Calls the highlighted row's `onHighlight` once it has stayed highlighted for
 * `HIGHLIGHT_INTENT_MS`. Never while the search is blank, so opening the
 * palette does not prefetch for its auto-highlighted first row.
 */
export function createHighlightIntent(
	highlighted: Accessor<string | null>,
	search: Accessor<string>,
	visible: Accessor<CommandPaletteItem[]>
): void {
	createEffect(() => {
		const value = highlighted();
		if (value === null || search() === "") return;
		const item = visible().find((each) => each.value === value);
		if (!item?.onHighlight) return;
		const timer = setTimeout(() => {
			item.onHighlight?.();
		}, HIGHLIGHT_INTENT_MS);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});
}

/** What was used last, and the handler that records a pick. */
export function createRecents(
	props: Pick<CommandPaletteProps, "recentsKey" | "maxRecents">
) {
	const [recents, setRecents] = createSignal<string[]>([]);

	function select(item: CommandPaletteItem): void {
		const key = props.recentsKey;
		if (key === undefined) return;
		const next = addRecent(
			recents(),
			item.value,
			props.maxRecents ?? DEFAULT_MAX_RECENTS
		);
		setRecents(next);
		writeRecents(key, next);
	}

	return { recents, setRecents, select };
}

/**
 * The handler for a picked value: records it, closes the palette and runs the
 * pick inside that close, so an overlay or page it opens joins the transition
 * and the picked row grows into it.
 */
export function createPick(
	props: Pick<CommandPaletteProps, "items" | "onOpenChange">,
	select: (item: CommandPaletteItem) => void,
	rowFor: (value: string) => HTMLElement | null
): (value: string) => void {
	return (value) => {
		const item = props.items.find((option) => option.value === value);
		if (!item) return;
		select(item);
		// Keyboard Enter keeps focus in the input, so the close cannot find
		// the row by activation: mark it, and the palette closes into it.
		rowFor(value)?.setAttribute(MORPH_FROM, "");
		props.onOpenChange(false);
		void viewTransition(() => {
			item.onSelect();
		});
	};
}

/** Toggles the palette on its shortcut. */
export function createOpenHotkey(
	props: Pick<CommandPaletteProps, "open" | "onOpenChange">,
	shortcut: Accessor<Hotkey>
): void {
	createHotkey(
		shortcut,
		(event) => {
			event.preventDefault();
			props.onOpenChange(!props.open);
		},
		// The palette is a modifier combo (`Mod+K`) and must open from anywhere,
		// including while a text field has focus — the raw listener it replaced
		// did. The library's `ignoreInputs` default (true) would swallow it in
		// exactly those fields, so turn it off.
		() => ({ ignoreInputs: false })
	);
}

/** Blanks the search and re-reads the recents each time the palette opens.
 *  Read on open, not on mount: another tab may have added to the list, and the
 *  palette is cheap to re-read. */
export function resetOnOpen(
	props: Pick<CommandPaletteProps, "open" | "recentsKey">,
	setSearch: (value: string) => void,
	setRecents: (recents: string[]) => void
): void {
	createEffect(() => {
		if (!props.open) return;
		setSearch("");
		const key = props.recentsKey;
		setRecents(key === undefined ? [] : readRecents(key));
	});
}
