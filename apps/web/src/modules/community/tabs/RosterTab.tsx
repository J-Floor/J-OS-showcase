import {
	type JfColumnDefinition,
	Table,
	type TableRootProps,
} from "@j-os/design-system";
import { type JSX, Show, createSignal } from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { ActionKeys } from "../../../shared/actions/createActionKeys.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import {
	createSheetNav,
	type SheetNavState,
} from "../../../shared/entity/createSheetNav.ts";
import { useRowPrefetch } from "../../../shared/entity/useRowPrefetch.ts";
import { RosterActionError } from "../actions/RosterActionError.tsx";
import type { ShortcutScope } from "../actions/shortcuts.ts";
import { personEntity } from "../entity.ts";

import {
	RosterSheet,
	useSheetEditing,
	type FooterLead,
} from "./RosterSheet.tsx";
import type { PersonSelection, RowKeysPlace, TabProps } from "./TabProps.ts";

/**
 * What this tab does with the page-wide person selection: the row it names in
 * this tab's own rows, and whether this tab's sheet is the one up.
 */
function useRosterSelection<Row extends PersonRow>(
	tab: TabProps,
	data: () => Row[] | undefined
) {
	// The page creates one selection and never swaps it, so reading it once at
	// setup is safe; every value it hands out is an accessor.
	const selection = tab.selection;
	// Looked up live in this tab's own rows, never a snapshot: an edit made in
	// the sheet refetches the roster and must show at once. By the shown id,
	// held through a close, so the sheet still shows the person when the
	// browser captures its close.
	function selected(): Row | undefined {
		const id = selection.shownId();
		return id === undefined
			? undefined
			: data()?.find((row) => row._id === id);
	}
	/**
	 * Whether THIS tab's sheet is up. All three tabs share one selection and
	 * stay mounted once visited, so each shows the sheet only for a person in
	 * its own rows. While its rows are still loading it cannot know, so only the
	 * tab on screen opens (on the skeleton). Once its rows have loaded it does
	 * not also require `tab.active`: the rosters are disjoint, and the page's
	 * tab-follow catches up when a person moves from one roster to another.
	 */
	function open(): boolean {
		const id = selection.requestedId();
		if (!selection.open() || id === undefined) return false;
		const rows = data();
		return rows === undefined
			? (tab.active ?? false)
			: rows.some((row) => row._id === id);
	}

	return { selection, selected, open };
}

/** What the roster knows about its sheet. */
type RosterState<Row> = {
	open: () => boolean;
	selected: () => Row | undefined;
	/** The selection's hint that its sheet is about to open. */
	intend: () => void;
};

/**
 * The page's action keys: they act on the checked rows, else the ringed
 * row. Rendered among the table's parts, for its selection: a batch run with
 * rows checked unchecks them once it went through, as the selection bar's
 * button does. Quiet while the sheet (or anything) is open over the page:
 * the sheet's own keys (`RosterSheetKeys`) act on its person then.
 */
function RosterTableKeys<Row extends PersonRow>(props: {
	tab: TabProps;
	scope: ShortcutScope;
	actions: () => ActionDescriptor<Row>[];
	focusedRow: () => Row | undefined;
	onAdvance: () => void;
}): JSX.Element {
	const selection = Table.useSelection<Row>();
	return (
		<ActionKeys<Row>
			scope={props.scope}
			actions={props.actions}
			selected={selection.rows}
			focused={props.focusedRow}
			onAdvance={props.onAdvance}
			onClearSelection={selection.clear}
			active={() => props.tab.active ?? false}
		/>
	);
}

/** The sheet's keys, rendered inside it: the tab's actions, and the tab's
 *  own row keys (`focusedRowKeys`), on the person the sheet shows. */
function RosterSheetKeys<Row extends PersonRow>(props: {
	scope: ShortcutScope;
	actions: () => ActionDescriptor<Row>[];
	shown: () => Row | undefined;
	isOpen: () => boolean;
	focusedRowKeys?: (
		focused: () => Row | undefined,
		place: RowKeysPlace
	) => void;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- bound once at setup; the keys read the accessor
	props.focusedRowKeys?.(props.shown, "sheet");
	return (
		<ActionKeys<Row>
			scope={props.scope}
			actions={props.actions}
			target={props.shown}
			active={props.isOpen}
		/>
	);
}

/** The sheet's prev/next, stepping through the rows on screen (sorted,
 *  grouped and filtered as the table shows them). */
function useDisplayedRowsNav<Row extends PersonRow>(
	selected: () => Row | undefined,
	openRow: (row: Row) => void
) {
	const [displayed, setDisplayed] = createSignal<Row[]>([]);
	const nav = createSheetNav({
		items: displayed,
		currentId: () => selected()?._id,
		onSelect: openRow,
	});
	return { nav, setDisplayed };
}

/** The row the keyboard ring is on, and the person prefetch that follows it
 *  (and the pointer's hover intent), so the sheet opens on warm data. */
function useFocusedRowPrefetch<Row extends PersonRow>() {
	const [focusedRow, setFocusedRow] = createSignal<Row>();
	const prefetchRow = useRowPrefetch(personEntity);
	return {
		focusedRow,
		prefetchRow,
		onFocusedRowChange: (row: Row | undefined) => {
			setFocusedRow(() => row);
			prefetchRow(row);
		},
	};
}

/** What the table hands back to drive its keyboard ring. */
type FocusApi<Row extends PersonRow> = Parameters<
	NonNullable<TableRootProps<Row>["focusApi"]>
>[0];

type RosterTabProps<Row extends PersonRow> = {
	tab: TabProps;
	/** The loaded rows, or `undefined` while the query is still loading. */
	data: () => Row[] | undefined;
	columns: () => JfColumnDefinition<Row>[];
	groupBy: string;
	initialColumnSorting?: TableRootProps<Row>["initialColumnSorting"];
	/** Descriptors driving both the row keys and the sheet footer. */
	actions: () => ActionDescriptor<Row>[];
	/** The tab's own scope: where its failed actions are kept and shown. */
	scope: ShortcutScope;
	/** Rendered in the sheet footer above the decision buttons (Applications'
	 *  score field). */
	footerLead?: FooterLead;
	/** Parts: the tab's `Table.BatchActions`. */
	children?: JSX.Element;
	/**
	 * Lets a tab bind extra document-level keys that act on the *focused* row
	 * while the roster owns the keyboard. Given an accessor for the focused row —
	 * which is `undefined` whenever focus is outside the table or rows are
	 * checked, so a handler that bails on `undefined` is automatically inert in
	 * both. While a sheet is open the row it shows IS reported (the table pins
	 * the ring to it), so the letters act on that person. Invoked once at setup,
	 * inside a reactive owner, so the callback can call `createHotkey(s)`
	 * directly. Applications uses it for number-to-score and, on the page
	 * only, `n`-to-note. Bound twice: on the page for the ringed row, and
	 * inside the sheet for its person (its place option), so each binding yields to
	 * what is shown over it.
	 */
	focusedRowKeys?: (
		focused: () => Row | undefined,
		place: RowKeysPlace
	) => void;
};

/** The roster's keyboard side: the ringed row, its prefetch, and the action
 *  and tab-specific keys that act on it. */
function useRosterFocus<Row extends PersonRow>(
	props: RosterTabProps<Row>,
	state: RosterState<Row>
) {
	const { focusedRow, onFocusedRowChange, prefetchRow } =
		useFocusedRowPrefetch<Row>();
	let focusApi: FocusApi<Row> | undefined;

	// A tab's own row-scoped keys, bound once at setup (the callback registers
	// hotkeys and is handed `focusedRow` as an accessor, not a read value —
	// `focusedRow` is already cleared whenever the ring is not the target, so
	// they fire only when they should). A one-time setup call, not a
	// reactive read.
	props.focusedRowKeys?.(focusedRow, "page");
	return {
		focusedRow,
		onAdvance: () => {
			focusApi?.advance();
		},
		onFocusedRowChange,
		/** Warms the row's data and builds the sheet ahead of the open. */
		onHoverIntent: (row: Row) => {
			prefetchRow(row);
			state.intend();
		},
		setFocusApi: (api: FocusApi<Row>) => {
			focusApi = api;
		},
	};
}

/** The tab's person sheet: its edit mode, its decision footer and its
 *  keys. */
function RosterTabSheet<Row extends PersonRow>(props: {
	roster: RosterTabProps<Row>;
	selection: PersonSelection;
	isOpen: boolean;
	selected: Row | undefined;
	nav: SheetNavState;
}): JSX.Element {
	const [editing, setEditing] = useSheetEditing(
		() => props.isOpen,
		() => props.selection.requestedId(),
		() => props.roster.scope
	);
	return (
		<RosterSheet
			isOpen={props.isOpen}
			prebuild={props.selection.prebuild()}
			isLoading={props.roster.data() === undefined}
			selected={props.selected}
			isEditing={editing()}
			onToggleEditing={() => {
				setEditing((isEditing) => !isEditing);
			}}
			nav={props.nav}
			onClose={props.selection.close}
			actions={props.roster.actions()}
			scope={props.roster.scope}
			footerLead={props.roster.footerLead}
		>
			<RosterSheetKeys
				scope={props.roster.scope}
				actions={() => props.roster.actions()}
				shown={() => (props.isOpen ? props.selected : undefined)}
				isOpen={() => props.isOpen}
				focusedRowKeys={props.roster.focusedRowKeys}
			/>
		</RosterSheet>
	);
}

/**
 * The scaffold every community roster tab shares: a grouped, virtualised,
 * selectable {@link Table} with keyboard row-focus, a selection bar, and a detail
 * sheet (edit toggle + prev/next nav in the header, a decision bar
 * of the tab's actions in the footer, `PersonDetail` in the body).
 *
 * The three tabs differ only in their data, columns, grouping, sort, action
 * descriptors and selection-bar contents — everything else (the sheet, the
 * deep-link wiring, the URL sync, the action-key registration, focus handling)
 * lived three times over and drifted; it lives here now, once.
 *
 * What stays with each tab is what is genuinely its own: which query feeds it,
 * its columns, its `useXActions` descriptors (with their tab-specific callbacks),
 * and the parts it passes as children: its `Table.BatchActions` and, if it has
 * one, a `footerLead`. Any other chrome a tab needs (a provider,
 * a dialog) goes around or beside the `RosterTab.Root`.
 *
 * Every roster row is a {@link PersonRow}: a person carrying its derived
 * status, enough for the sheet's `PersonDetail`, the id lookups here
 * and the person descriptor's prefetch.
 */
function RosterTabRoot<Row extends PersonRow>(
	props: RosterTabProps<Row>
): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- the page's stable props object, read lazily inside
	const { selection, selected, open } = useRosterSelection(props.tab, () =>
		props.data()
	);
	const focus = useRosterFocus(props, {
		open,
		selected,
		intend: selection.intend,
	});
	const { nav, setDisplayed } = useDisplayedRowsNav(selected, (row) => {
		selection.openRow(row);
	});

	return (
		<>
			<Show when={!open()}>
				<RosterActionError scope={props.scope} />
			</Show>
			<Table.Root
				columns={props.columns()}
				data={props.data()}
				getRowId={(row) => row._id}
				groupBy={props.groupBy}
				virtualize
				initialColumnSorting={props.initialColumnSorting}
				enableRowSelection
				focusableRows
				autofocusFirstRow
				// Off-screen tabs stay mounted; suppressing their ring keeps
				// a hidden tab from claiming focus or showing a ring nobody
				// can see.
				suppressFocus={open() || !(props.tab.active ?? false)}
				// While the sheet is open, pin the ring to whoever it
				// shows so the roster stays in sync (and scrolls to them)
				// as you page person to person with the sheet arrows;
				// closing then leaves you on that row.
				activeRowId={() => (open() ? selected()?._id : undefined)}
				onFocusedRowChange={focus.onFocusedRowChange}
				onRowHoverIntent={focus.onHoverIntent}
				onRowActivate={(row) => {
					selection.openRow(row);
				}}
				focusApi={focus.setFocusApi}
				onDisplayedRowsChange={setDisplayed}
				onRowClick={(row) => {
					selection.openRow(row);
				}}
			>
				<RosterTableKeys
					tab={props.tab}
					scope={props.scope}
					actions={() => props.actions()}
					focusedRow={focus.focusedRow}
					onAdvance={focus.onAdvance}
				/>
				{props.children}
			</Table.Root>
			<RosterTabSheet
				roster={props}
				selection={selection}
				isOpen={open()}
				selected={selected()}
				nav={nav}
			/>
		</>
	);
}

export const RosterTab = {
	Root: RosterTabRoot,
};
