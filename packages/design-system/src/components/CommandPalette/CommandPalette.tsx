import { Combobox, createListCollection } from "@ark-ui/solid/combobox";
import { createHotkey, type Hotkey } from "@tanstack/solid-hotkeys";
import clsx from "clsx";
import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	type JSX,
} from "solid-js";

import { ICONS } from "../../icons.ts";
import { Dialog } from "../Dialog/Dialog.tsx";
import { Highlight } from "../Highlight/Highlight.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";
import { ClearSearchButton } from "../SearchInput/ClearSearchButton.tsx";

import {
	addRecent,
	readRecents,
	scoreMatch,
	writeRecents,
} from "./CommandPalette.helpers.ts";
import styles from "./CommandPalette.module.scss";

/** One thing the palette can take you to or do. */
export type CommandPaletteItem = {
	/** Stable identity, used for recents. Not shown. */
	value: string;
	/** What the user reads and searches. */
	label: string;
	/** Heading this item sits under, e.g. "People". Groups render in the order
	 *  their first item appears in `items`. */
	group: string;
	/** Extra terms that should find this item but are not a better name for it —
	 *  an email address, a synonym. Ranked below the label, always. */
	keywords?: string[];
	/** Material Symbols ligature. */
	icon?: string;
	/** Secondary line: a role, a project, a path. */
	detail?: string;
	/**
	 * Keep this out of the blank palette; offer it only once there is a query.
	 *
	 * For the open-ended lists — every person, every task — where an unfiltered
	 * dump is both unreadable and expensive: each row is a live listbox option,
	 * so a few hundred of them is a few hundred DOM nodes built before the user
	 * has said what they want. The blank palette is for the handful of fixed
	 * destinations and what you reached for last; everything else is found by
	 * typing.
	 */
	searchOnly?: boolean;
	onSelect: () => void;
};

export type CommandPaletteProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: CommandPaletteItem[];
	placeholder?: string;
	/** Shown when nothing matches. @default "No matches." */
	emptyMessage?: string;
	/** `localStorage` key for the recent list. Omit to not keep recents. */
	recentsKey?: string;
	/** @default 5 */
	maxRecents?: number;
	/**
	 * Most rows to show under any one heading. The rest are counted in the
	 * heading rather than rendered: nobody scrolls to the sixtieth name, they
	 * type another letter, and rendering all sixty costs the same whether or not
	 * anyone looks. @default 8
	 */
	maxPerGroup?: number;
	/**
	 * Bound here rather than by the caller, and rendered in the footer from the
	 * same object — a hint that says one key while another opens the palette is
	 * worse than no hint. @default mod+K
	 */
	shortcut?: Hotkey;
	class?: string;
};

const DEFAULT_SHORTCUT: Hotkey = "Mod+K";

const RECENT_GROUP = "Recent";

/**
 * Search-everything dialog: type, arrow through the results, Enter to go.
 *
 * Built on Ark's Combobox rather than a command-palette library. The two Solid
 * ones are `cmdk-solid`, which brings a whole second headless-UI framework
 * (Kobalte) alongside Ark, and `solid-command-palette`, last published in 2022.
 * Ark is already here and its Combobox is exactly this primitive — a filtered
 * listbox with keyboard navigation and the right ARIA roles.
 *
 * The ranking and the recents are ported from EmboUI, whose own palette was
 * built on the React-only `cmdk`; that logic is framework-free and carried
 * across unchanged, unlike the component around it.
 */
export function CommandPalette(props: CommandPaletteProps): JSX.Element {
	const [search, setSearch] = createSignal("");
	// Clearing puts the caret back where the typing happens; a cleared field you
	// then have to click into is worse than no button at all.
	let inputRef: HTMLInputElement | undefined = undefined;
	const [recents, setRecents] = createSignal<string[]>([]);

	function maxRecents(): number {
		return props.maxRecents ?? 5;
	}

	function maxPerGroup(): number {
		return props.maxPerGroup ?? 8;
	}

	function shortcut(): Hotkey {
		return props.shortcut ?? DEFAULT_SHORTCUT;
	}

	// The binding lives with the component that owns the hint. The library
	// requires every unnamed modifier to be ABSENT, so this does not also fire
	// on Ctrl+Shift+K and steal the browser's console.
	createHotkey(
		() => shortcut(),
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

	// Read on open, not on mount: another tab may have added to the list, and
	// the palette is cheap to re-read.
	createEffect(() => {
		if (!props.open) return;
		setSearch("");
		const key = props.recentsKey;
		setRecents(key === undefined ? [] : readRecents(key));
	});

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
		const open = searching();
		return props.items
			.filter((item) => open || item.searchOnly !== true)
			.map((item, index) => ({
				item,
				index,
				score: scoreMatch(item.label, term, item.keywords),
			}))
			.filter((scored) => scored.score > 0)
			.sort((a, b) => b.score - a.score || a.index - b.index)
			.map((scored) => scored.item);
	});

	/**
	 * What was used last, shown only on a blank search. Once you have typed
	 * something you are looking for that thing, not for your own history — and
	 * a Recent copy of an item that also matches would list it twice.
	 */
	const recentItems = createMemo(() => {
		if (searching() || props.recentsKey === undefined) return [];
		const byValue = new Map(props.items.map((i) => [i.value, i]));
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
			...ranked().filter((i) => !pinned.has(i.value)),
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
	let listRef: HTMLElement | undefined = undefined;
	createEffect(() => {
		const value = highlighted();
		if (value === null) return;
		const isFirst = visible().at(0)?.value === value;
		// Deferred: when the highlight moves because the LIST changed, the row
		// it points at is rendered by the same pass this effect runs in, and is
		// not in the DOM yet when the effect fires.
		queueMicrotask(() => {
			if (!listRef) return;
			if (isFirst) {
				listRef.scrollTop = 0;
				return;
			}
			const row = listRef.querySelector(
				`[role="option"][data-value="${CSS.escape(value)}"]`
			);
			// jsdom does no layout and ships no `scrollIntoView`, so a test
			// environment must not be the thing that throws here.
			if (typeof row?.scrollIntoView === "function")
				row.scrollIntoView({ block: "nearest" });
		});
	});

	function select(item: CommandPaletteItem): void {
		const key = props.recentsKey;
		if (key !== undefined) {
			const next = addRecent(recents(), item.value, maxRecents());
			setRecents(next);
			writeRecents(key, next);
		}
		props.onOpenChange(false);
		item.onSelect();
	}

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(details) => {
				props.onOpenChange(details.open);
			}}
			// A palette opens to be TYPED IN, so it is one of the few dialogs
			// with an obvious first field. `Dialog.Root` otherwise focuses the
			// dialog itself (so a screen reader announces it instead of the
			// close button) — correct in general, wrong here: ⌘K opened the
			// palette with the caret nowhere, and the first keystroke went
			// nowhere with it. This is the ONLY thing that should focus the
			// input, and only on open — an `autofocus` attribute on the field
			// fired on mount instead (the palette is mounted while closed) and
			// stole focus into the hidden box, so it was removed.
			initialFocusEl={() => inputRef ?? null}
		>
			<Dialog.Content
				class={clsx(styles.dialog, props.class)}
				// The dialog's own X is suppressed here, and the field carries a
				// clear button instead. An X beside a search box means "empty
				// this box" — putting the close action there invites you to lose
				// the whole palette when you only wanted to retype. Escape closes
				// it, and the footer says so.
				classOverride={{ closeClass: styles.hiddenClose }}
			>
				<Combobox.Root
					collection={collection()}
					// Open WITH the dialog, not always. Inside an open dialog there
					// is nothing to open onto and a palette that hides its list until
					// you type shows an empty box — so while the dialog is up the
					// combobox is open and the list browses freely. But the dialog
					// stays MOUNTED while closed (an overlay cannot gate its own
					// mount), and an always-open combobox pulls focus into its input on
					// mount: on every page load focus was stolen into this closed,
					// invisible palette, so the roster's arrow keys and Alt-to-peek
					// went to a hidden search box and the table never saw a keystroke.
					// Tying it to `props.open` keeps the list-always-shown behaviour
					// while the palette is up and leaves focus alone while it is not.
					open={props.open}
					// Enter must RUN the highlighted row, not type it into the box.
					// zag's default input behaviour completes the query with the
					// highlighted item, which looked like Enter doing nothing: the
					// field filled in, the list narrowed to one, and nothing opened.
					inputBehavior="none"
					// And nothing is left selected afterwards — the palette closes
					// and reopens blank, so a stale selection would filter the next
					// search down to the thing you picked last time.
					selectionBehavior="clear"
					highlightedValue={highlighted()}
					onHighlightChange={(details) => {
						setHighlighted(details.highlightedValue);
					}}
					inputValue={search()}
					onInputValueChange={(details) => {
						setSearch(details.inputValue);
					}}
					// `onSelect`, NOT `onValueChange`. `selectionBehavior="clear"`
					// only empties the input; zag still holds the picked value, so
					// picking the same row again is no change and `onValueChange`
					// never fires — reopening the person you just closed did
					// nothing. `onSelect` fires on every pick.
					onSelect={(details) => {
						const item = props.items.find(
							(i) => i.value === details.itemValue
						);
						if (item) select(item);
					}}
					class={styles.combobox}
				>
					<Combobox.Control class={styles.control}>
						<Icon class={styles.searchIcon}>{ICONS.search}</Icon>
						{/* NO `autofocus`. The palette stays mounted while closed
					    (an overlay cannot gate its own mount), so this input is in
					    the DOM from first paint — and `autofocus` fires on mount,
					    not on open, so it stole focus into the closed, invisible
					    palette on every page load. Focus trapped there, every
					    keystroke went to this hidden combobox: the roster's arrow
					    keys never focused a row and Alt-to-peek did nothing. Focus
					    on OPEN is handled by `initialFocusEl` on `Dialog.Root`
					    above, which is why the attribute was only ever redundant. */}
						<Combobox.Input
							class={styles.input}
							placeholder={props.placeholder ?? "Search…"}
							ref={(el: HTMLInputElement) => (inputRef = el)}
						/>
						{/* Only once there is something to clear: a permanent X
					    on an empty field is a button that does nothing.

					    NOT `Combobox.ClearTrigger`, which is tied to the
					    SELECTED value and renders itself `hidden` whenever
					    there isn't one — a palette closes on select and so
					    never holds a selection, leaving the trigger invisible
					    forever. What wants clearing here is the query. */}
						<Show when={search() !== ""}>
							<ClearSearchButton
								onClear={() => {
									setSearch("");
									inputRef?.focus();
								}}
							/>
						</Show>
					</Combobox.Control>
					{/* `Combobox.List`, not `Combobox.Content`. Content is a
				    dismissable LAYER, and nested inside the dialog's layer it is
				    never the topmost one — Ark marks it `pointer-events: none`,
				    so every row rendered fine and nothing could be clicked. The
				    list is the plain listbox part, which is all a palette needs:
				    the dialog already owns dismissal. */}
					<Combobox.List
						class={styles.content}
						ref={(el: HTMLElement) => (listRef = el)}
					>
						<Show
							when={groups().length > 0}
							fallback={
								<p class={styles.empty}>
									{props.emptyMessage ?? "No matches."}
								</p>
							}
						>
							<For each={groups()}>
								{(group) => (
									<Combobox.ItemGroup class={styles.group}>
										<Combobox.ItemGroupLabel
											class={styles.groupLabel}
										>
											{group.name}
											{/* Says what was left out, so a capped
										    group reads as "keep typing" rather
										    than "that's everyone". In the label,
										    not a row of its own: everything
										    inside a listbox should be an option
										    you can land on. */}
											<Show
												when={
													group.total >
													group.items.length
												}
											>
												<span class={styles.groupCount}>
													{group.items.length} of{" "}
													{group.total}
												</span>
											</Show>
										</Combobox.ItemGroupLabel>
										<For each={group.items}>
											{(item) => (
												<Combobox.Item
													item={item}
													class={styles.item}
												>
													<Show when={item.icon}>
														{(icon) => (
															<Icon
																class={
																	styles.itemIcon
																}
															>
																{icon()}
															</Icon>
														)}
													</Show>
													<span
														class={styles.itemText}
													>
														<Combobox.ItemText>
															{/* Shows WHY a row
														    matched, which is
														    what makes a long
														    list scannable. */}
															<Highlight
																query={search()}
																text={
																	item.label
																}
															/>
														</Combobox.ItemText>
														<Show
															when={item.detail}
														>
															{(detail) => (
																<span
																	class={
																		styles.itemDetail
																	}
																>
																	{detail()}
																</span>
															)}
														</Show>
													</span>
												</Combobox.Item>
											)}
										</For>
									</Combobox.ItemGroup>
								)}
							</For>
						</Show>
					</Combobox.List>
					<footer class={styles.footer}>
						<Kbd shortcut="ArrowUp" />
						<Kbd shortcut="ArrowDown">to move</Kbd>
						<Kbd shortcut="Enter">to open</Kbd>
						<Kbd shortcut={shortcut()}>to search</Kbd>
						<Kbd shortcut="Escape">to close</Kbd>
					</footer>
				</Combobox.Root>
			</Dialog.Content>
		</Dialog.Root>
	);
}
