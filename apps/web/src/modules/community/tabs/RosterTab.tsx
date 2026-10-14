import {
	type BatchActionsRenderProps,
	Drawer,
	DrawerNav,
	type JfColumnDefinition,
	Table,
} from "@j-os/design-system";
import { type JSX, Show, createEffect, createSignal, on } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { createDrawerNav } from "../../../lib/createDrawerNav.ts";
import { useRowPrefetch } from "../../../shared/entity/useRowPrefetch.ts";
import { createActionKeys } from "../actions/createActionKeys.ts";
import type { ActionDescriptor } from "../actions/shortcuts.ts";
import { DecisionBar } from "../drawers/DecisionBar.tsx";
import { EditToggle } from "../drawers/EditToggle.tsx";
import { PersonDetail } from "../drawers/PersonDetail.tsx";
import { PersonDetailPlaceholder } from "../drawers/PersonDetailPlaceholder.tsx";
import { personEntity } from "../entity.ts";
import type { PersonRow } from "../insights/metrics.ts";

import styles from "./RosterTab.module.scss";
import type { TabProps } from "./TabProps.ts";

/** Run each row through a per-row mutation (Convex mutations are individually
 *  transactional), then clear the selection. */
export type RunBatch<Row> = (
	rows: Row[],
	action: (id: Id<"people">) => Promise<unknown>,
	clearSelection: () => void
) => Promise<void>;

/** What a tab's selection bar is handed: the Table's own render props plus the
 *  shared {@link RunBatch}. */
export type RosterBatchProps<Row extends Record<string, unknown>> =
	BatchActionsRenderProps<Row> & { runBatch: RunBatch<Row> };

/**
 * What this tab does with the page-wide person selection: the row it names in
 * this tab's own rows, and whether this tab's drawer is the one up.
 */
function useRosterSelection<Row extends PersonRow>(
	tab: TabProps,
	data: () => Row[] | undefined
) {
	// The page creates one selection and never swaps it, so reading it once at
	// setup is safe; every value it hands out is an accessor.
	const selection = tab.selection;
	// Looked up live in this tab's own rows, never a snapshot: an edit made in
	// the drawer refetches the roster and must show at once.
	function selected(): Row | undefined {
		const id = selection.selectedId();
		return id === undefined
			? undefined
			: data()?.find((row) => row._id === id);
	}
	/**
	 * Whether THIS tab's drawer is up. All three tabs share one selection and
	 * stay mounted once visited, so each shows the drawer only for a person in
	 * its own rows. While its rows are still loading it cannot know, so only the
	 * tab on screen opens (on the skeleton). Once its rows have loaded it does
	 * not also require `tab.active`: the rosters are disjoint, and the page's
	 * tab-follow catches up when a person moves from one roster to another.
	 */
	function open(): boolean {
		const id = selection.selectedId();
		if (!selection.open() || id === undefined) return false;
		const rows = data();
		return rows === undefined
			? (tab.active ?? false)
			: rows.some((row) => row._id === id);
	}

	return { selection, selected, open };
}

function RosterDrawer<Row extends PersonRow>(props: {
	isOpen: boolean;
	isLoading: boolean;
	selected: Row | undefined;
	isEditing: boolean;
	onToggleEditing: () => void;
	nav: ReturnType<typeof createDrawerNav>;
	onClose: () => void;
	footerLead?: (person: Row) => JSX.Element;
	actions: ActionDescriptor<Row>[];
}): JSX.Element {
	return (
		<Drawer.Root
			open={props.isOpen}
			onOpenChange={(isOpen) => {
				if (!isOpen) props.onClose();
			}}
		>
			<Drawer.Header>
				<Drawer.Title loading={props.isLoading}>
					{`${props.selected?.firstName ?? ""} ${props.selected?.lastName ?? ""}`.trim()}
				</Drawer.Title>
				<Drawer.HeaderActions>
					<EditToggle
						editing={props.isEditing}
						enabled={props.isOpen}
						onToggle={props.onToggleEditing}
					/>
					<DrawerNav
						onPrev={props.nav.prev}
						onNext={props.nav.next}
						hasPrev={props.nav.hasPrev()}
						hasNext={props.nav.hasNext()}
					/>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>
			<Drawer.Body
				loading={props.isLoading}
				skeleton={<PersonDetailPlaceholder />}
			>
				<Show when={props.selected}>
					{(person) => (
						<PersonDetail
							person={person()}
							editing={props.isEditing}
						/>
					)}
				</Show>
			</Drawer.Body>
			<Show when={props.selected}>
				{(person) => (
					<Drawer.Footer>
						<div class={styles.footer}>
							{props.footerLead?.(person())}
							<div class={styles.footerActions}>
								<DecisionBar
									person={person()}
									actions={props.actions}
								/>
							</div>
						</div>
					</Drawer.Footer>
				)}
			</Show>
		</Drawer.Root>
	);
}

async function runBatch(
	rows: { _id: Id<"people"> }[],
	action: (id: Id<"people">) => Promise<unknown>,
	clearSelection: () => void
): Promise<void> {
	for (const row of rows) {
		await action(row._id);
	}
	clearSelection();
}

/** Edit mode for the drawer: flips the profile fields to inputs. Reset
 *  whenever a different person is opened or the drawer closes. */
function useDrawerEditing(
	isOpen: () => boolean,
	selection: TabProps["selection"]
) {
	const [editing, setEditing] = createSignal(false);
	createEffect(
		on(
			() => (isOpen() ? selection.selectedId() : undefined),
			() => {
				setEditing(false);
			}
		)
	);
	return [editing, setEditing] as const;
}

/** The document-level action keys: they act on the drawer's person, else the
 *  checked rows, else the ringed row. */
function useRosterActionKeys<Row extends PersonRow>(
	props: {
		tab: TabProps;
		actions: () => ActionDescriptor<Row>[];
	},
	state: {
		open: () => boolean;
		selected: () => Row | undefined;
		checked: () => Row[];
		focusedRow: () => Row | undefined;
		onAdvance: () => void;
		onClearSelection: () => void;
	}
): void {
	createActionKeys<Row>({
		// Wrapped, not passed by reference: reading `props.actions` directly here
		// (outside a tracked scope) would fix the accessor at setup; the arrow
		// defers the read into `createActionKeys`' own tracked scope.
		actions: () => props.actions(),
		// The drawer wins over the roster: whoever it shows is who you are looking
		// at, whatever the ring or the checkboxes say underneath it.
		drawerPerson: () => (state.open() ? state.selected() : undefined),
		selected: state.checked,
		focused: state.focusedRow,
		onAdvance: state.onAdvance,
		onClearSelection: state.onClearSelection,
		// Live when this tab is on screen, or its drawer is up — the selection
		// alone cannot express the idle-on-screen case.
		active: () => (props.tab.active ?? false) || state.open(),
	});
}

/** The drawer's prev/next, stepping through the rows on screen (sorted,
 *  grouped and filtered as the table shows them). */
function useDisplayedRowsNav<Row extends PersonRow>(
	selected: () => Row | undefined,
	openRow: (row: Row) => void
) {
	const [displayed, setDisplayed] = createSignal<Row[]>([]);
	const nav = createDrawerNav({
		items: displayed,
		currentId: () => selected()?._id,
		onSelect: openRow,
	});
	return { nav, setDisplayed };
}

/** The row the keyboard ring is on, and the person prefetch that follows it
 *  (and the pointer's hover intent), so the drawer opens on warm data. */
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

type RosterTabProps<Row extends PersonRow> = {
	tab: TabProps;
	/** The loaded rows, or `undefined` while the query is still loading. */
	data: () => Row[] | undefined;
	columns: () => JfColumnDefinition<Row>[];
	groupBy: string;
	initialColumnSorting?: { id: string; desc: boolean }[];
	/** Descriptors driving both the row keys and the drawer footer. */
	actions: () => ActionDescriptor<Row>[];
	/** The selection bar's contents, given the selection plus {@link RunBatch}. */
	batchActions: (props: RosterBatchProps<Row>) => JSX.Element;
	/** Tab-specific chrome rendered beside the drawer — e.g. a dialog the tab's
	 *  actions open. */
	extra?: JSX.Element;
	/** Rendered in the drawer footer ABOVE the decision buttons — Applications
	 *  puts a score field here so the board can score without leaving the drawer. */
	footerLead?: (person: Row) => JSX.Element;
	/**
	 * Lets a tab bind extra document-level keys that act on the *focused* row
	 * while the roster owns the keyboard. Given an accessor for the focused row —
	 * which is `undefined` whenever focus is outside the table or rows are
	 * checked, so a handler that bails on `undefined` is automatically inert in
	 * both. While a drawer is open the row it shows IS reported (the table pins
	 * the ring to it), so the letters act on that person. Invoked once at setup,
	 * inside this component's reactive owner, so the callback can call
	 * `createHotkey(s)` directly. Applications uses it for number-to-score and
	 * `n`-to-note.
	 */
	focusedRowKeys?: (focused: () => Row | undefined) => void;
};

/**
 * The scaffold every community roster tab shares: a grouped, virtualised,
 * selectable {@link Table} with keyboard row-focus, a selection bar, and a detail
 * {@link Drawer} (edit toggle + prev/next nav in the header, a {@link DecisionBar}
 * of the tab's actions in the footer, {@link PersonDetail} in the body).
 *
 * The three tabs differ only in their data, columns, grouping, sort, action
 * descriptors and selection-bar contents — everything else (the drawer, the
 * deep-link wiring, the URL sync, the action-key registration, focus handling)
 * lived three times over and drifted; it lives here now, once.
 *
 * What stays with each tab is what is genuinely its own: which query feeds it,
 * its columns, its `useXActions` descriptors (with their tab-specific callbacks),
 * the selection-bar buttons, and any extra chrome (a provider, a dialog) passed
 * as `extra`.
 *
 * Every roster row is a {@link PersonRow}: a person carrying its derived
 * status, enough for the drawer's {@link PersonDetail}, the id lookups here
 * and the person descriptor's prefetch.
 */
export function RosterTab<Row extends PersonRow>(
	props: RosterTabProps<Row>
): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- the page's stable props object, read lazily inside
	const { selection, selected, open } = useRosterSelection(props.tab, () =>
		props.data()
	);
	const [editing, setEditing] = useDrawerEditing(open, selection);
	const { focusedRow, onFocusedRowChange, prefetchRow } =
		useFocusedRowPrefetch<Row>();
	const [checked, setChecked] = createSignal<Row[]>([]);
	let focusApi: { advance: () => void } | undefined;

	const { nav, setDisplayed } = useDisplayedRowsNav(selected, (row) => {
		selection.openRow(row);
	});

	useRosterActionKeys(props, {
		open,
		selected,
		checked,
		focusedRow,
		onAdvance: () => {
			focusApi?.advance();
		},
		onClearSelection: () => {
			setChecked([]);
		},
	});

	// A tab's own row-scoped keys, bound once at setup (the callback registers
	// hotkeys and is handed `focusedRow` as an accessor, not a read value —
	// `focusedRow` is already cleared whenever the ring is not the target, so
	// they fire only when they should). A one-time setup call, like
	// `createActionKeys` above, not a reactive read.
	// eslint-disable-next-line solid/reactivity -- one-time setup; focusedRow passed as an accessor
	props.focusedRowKeys?.(focusedRow);

	return (
		<>
			<Table.Root
				columns={props.columns()}
				data={props.data()}
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
				// While the drawer is open, pin the ring to whoever it
				// shows so the roster stays in sync (and scrolls to them)
				// as you page person to person with the drawer arrows;
				// closing then leaves you on that row.
				activeRowId={() => (open() ? selected()?._id : undefined)}
				onFocusedRowChange={onFocusedRowChange}
				onRowHoverIntent={prefetchRow}
				onRowActivate={(row) => {
					selection.openRow(row);
				}}
				focusApi={(api) => {
					focusApi = api;
				}}
				onSelectedRowsChange={setChecked}
				onDisplayedRowsChange={setDisplayed}
				onRowClick={(row) => {
					selection.openRow(row);
				}}
			>
				<Table.BatchActions<Row>>
					{(batch) => props.batchActions({ ...batch, runBatch })}
				</Table.BatchActions>
			</Table.Root>
			<RosterDrawer
				isOpen={open()}
				isLoading={props.data() === undefined}
				selected={selected()}
				isEditing={editing()}
				onToggleEditing={() => {
					setEditing((isEditing) => !isEditing);
				}}
				nav={nav}
				onClose={() => {
					selection.close();
				}}
				footerLead={props.footerLead}
				actions={props.actions()}
			/>
			{props.extra}
		</>
	);
}
