import { Combobox } from "@ark-ui/solid/combobox";
import { type Hotkey } from "@tanstack/solid-hotkeys";
import clsx from "clsx";
import { For, Show, createSignal, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { type MorphOverlayProps } from "../../utils/morphPresence.ts";
import { Dialog } from "../Dialog/Dialog.tsx";
import { Highlight } from "../Highlight/Highlight.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";
import { ClearSearchButton } from "../SearchInput/ClearSearchButton.tsx";

import {
	createHighlight,
	createHighlightIntent,
	createOpenHotkey,
	createPaletteResults,
	createRecents,
	createPick,
	resetOnOpen,
	type PaletteGroup,
} from "./CommandPalette.hooks.ts";
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
	/**
	 * Called once this row has stayed highlighted for a beat: the user's
	 * intent to open it, before they do. Lets a caller warm the data behind
	 * the row. Not called while the search is blank, so opening the palette
	 * does not prefetch for its auto-highlighted first row.
	 */
	onHighlight?: () => void;
};

export type CommandPaletteProps = {
	open: boolean;
	/**
	 * Must update `open` synchronously. A pick closes first and runs its
	 * `onSelect` inside that close, so a sheet it opens can take over the
	 * picked row; a deferred update starts them in the wrong order.
	 */
	onOpenChange: (isOpen: boolean) => void;
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
} & MorphOverlayProps;

const DEFAULT_SHORTCUT: Hotkey = "Mod+K";

function shortcutOr(shortcut: Hotkey | undefined): Hotkey {
	return shortcut ?? DEFAULT_SHORTCUT;
}

/** The search input with its icon and, once there is a query, a clear button. */
function SearchField(props: {
	placeholder: string | undefined;
	hasQuery: boolean;
	setInput: (element: HTMLInputElement) => void;
	onClear: () => void;
}): JSX.Element {
	return (
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
				ref={props.setInput}
			/>
			{/* Only once there is something to clear: a permanent X
		    on an empty field is a button that does nothing.

		    NOT `Combobox.ClearTrigger`, which is tied to the
		    SELECTED value and renders itself `hidden` whenever
		    there isn't one — a palette closes on select and so
		    never holds a selection, leaving the trigger invisible
		    forever. What wants clearing here is the query. */}
			<Show when={props.hasQuery}>
				<ClearSearchButton onClear={props.onClear} />
			</Show>
		</Combobox.Control>
	);
}

/** The grouped rows, or the empty message when nothing matched. */
function PaletteGroups(props: {
	groups: PaletteGroup[];
	search: string;
	emptyMessage: string | undefined;
}): JSX.Element {
	return (
		<Show
			when={props.groups.length > 0}
			fallback={
				<p class={styles.empty}>
					{props.emptyMessage ?? "No matches."}
				</p>
			}
		>
			<For each={props.groups}>
				{(group) => (
					<Combobox.ItemGroup class={styles.group}>
						<Combobox.ItemGroupLabel class={styles.groupLabel}>
							{group.name}
							{/* Says what was left out, so a capped
											    group reads as "keep typing" rather
											    than "that's everyone". In the label,
											    not a row of its own: everything
											    inside a listbox should be an option
											    you can land on. */}
							<Show when={group.total > group.items.length}>
								<span class={styles.groupCount}>
									{group.items.length} of {group.total}
								</span>
							</Show>
						</Combobox.ItemGroupLabel>
						<For each={group.items}>
							{(item) => (
								<Combobox.Item item={item} class={styles.item}>
									<Show when={item.icon}>
										{(icon) => (
											<Icon class={styles.itemIcon}>
												{icon()}
											</Icon>
										)}
									</Show>
									<span class={styles.itemText}>
										<Combobox.ItemText>
											{/* Shows WHY a row
															    matched, which is
															    what makes a long
															    list scannable. */}
											<Highlight
												query={props.search}
												text={item.label}
											/>
										</Combobox.ItemText>
										<Show when={item.detail}>
											{(detail) => (
												<span class={styles.itemDetail}>
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
	);
}

/** The key hints along the bottom. */
function PaletteFooter(props: { shortcut: Hotkey }): JSX.Element {
	return (
		<footer class={styles.footer}>
			<Kbd shortcut="ArrowUp" />
			<Kbd shortcut="ArrowDown">to move</Kbd>
			<Kbd shortcut="Enter">to open</Kbd>
			<Kbd shortcut={props.shortcut}>to search</Kbd>
			<Kbd shortcut="Escape">to close</Kbd>
		</footer>
	);
}

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
	let inputReference: HTMLInputElement | undefined;
	const { recents, setRecents, select } = createRecents(props);

	// The binding lives with the component that owns the hint. The library
	// requires every unnamed modifier to be ABSENT, so this does not also fire
	// on Ctrl+Shift+K and steal the browser's console.
	createOpenHotkey(props, () => shortcutOr(props.shortcut));

	resetOnOpen(props, setSearch, setRecents);

	const { groups, visible, collection } = createPaletteResults(
		props,
		search,
		recents
	);
	const { highlighted, setHighlighted, setListReference, rowFor } =
		createHighlight(visible);
	const pick = createPick(props, select, rowFor);
	createHighlightIntent(highlighted, search, visible);

	return (
		<Dialog.Root
			open={props.open}
			morph={props.morph}
			morphFrom={props.morphFrom}
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
			initialFocusEl={() => inputReference ?? null}
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
						pick(details.itemValue);
					}}
					class={styles.combobox}
				>
					<SearchField
						placeholder={props.placeholder}
						hasQuery={search() !== ""}
						setInput={(element) => {
							inputReference = element;
						}}
						onClear={() => {
							setSearch("");
							inputReference?.focus();
						}}
					/>
					{/* `Combobox.List`, not `Combobox.Content`. Content is a
					    dismissable LAYER, and nested inside the dialog's layer it is
					    never the topmost one — Ark marks it `pointer-events: none`,
					    so every row rendered fine and nothing could be clicked. The
					    list is the plain listbox part, which is all a palette needs:
					    the dialog already owns dismissal. */}
					<Combobox.List
						class={styles.content}
						ref={setListReference}
					>
						<PaletteGroups
							groups={groups()}
							search={search()}
							emptyMessage={props.emptyMessage}
						/>
					</Combobox.List>
					<PaletteFooter shortcut={shortcutOr(props.shortcut)} />
				</Combobox.Root>
			</Dialog.Content>
		</Dialog.Root>
	);
}
