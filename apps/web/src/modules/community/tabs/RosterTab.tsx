import {
	type BatchActionsRenderProps,
	Drawer,
	DrawerNav,
	type JfColumnDef,
	Table,
} from "@j-os/design-system";
import { type JSX, Show, createEffect, createSignal, on } from "solid-js";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { createDrawerNav } from "../../../lib/createDrawerNav.ts";
import { createActionKeys } from "../actions/createActionKeys.ts";
import type { ActionDescriptor } from "../actions/shortcuts.ts";
import { DecisionBar } from "../drawers/DecisionBar.tsx";
import { EditToggle } from "../drawers/EditToggle.tsx";
import { PersonDetail } from "../drawers/PersonDetail.tsx";
import { PersonDetailPlaceholder } from "../drawers/PersonDetailPlaceholder.tsx";

import styles from "./RosterTab.module.scss";
import type { TabProps } from "./TabProps.ts";

/** Every roster row is a person carrying its derived status — enough for the
 *  drawer's {@link PersonDetail} and the id lookups here. */
type RosterRow = Doc<"people"> & { status: PersonStatus };

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
 */
export function RosterTab<Row extends RosterRow>(props: {
	tab: TabProps;
	/** The loaded rows, or `undefined` while the query is still loading. */
	data: () => Row[] | undefined;
	columns: () => JfColumnDef<Row>[];
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
}): JSX.Element {
	// The page creates one selection and never swaps it, so reading it once at
	// setup is safe; every value it hands out is an accessor.
	// eslint-disable-next-line solid/reactivity -- stable object, accessors inside
	const selection = props.tab.selection;
	// Looked up live in this tab's own rows, never a snapshot: an edit made in
	// the drawer refetches the roster and must show at once.
	function selected(): Row | undefined {
		const id = selection.selectedId();
		return id === undefined
			? undefined
			: props.data()?.find((r) => r._id === id);
	}
	/**
	 * Whether THIS tab's drawer is up. All three tabs share one selection and
	 * stay mounted once visited, so each shows the drawer only for a person in
	 * its own rows. While its rows are still loading it cannot know, so only the
	 * tab on screen opens (on the skeleton). Once its rows have loaded it does
	 * not also require `props.tab.active`: the rosters are disjoint, and the page's
	 * tab-follow catches up when a person moves from one roster to another.
	 */
	function open(): boolean {
		const id = selection.selectedId();
		if (!selection.open() || id === undefined) return false;
		const data = props.data();
		if (data === undefined) return props.tab.active ?? false;
		return data.some((r) => r._id === id);
	}
	// Edit mode for the drawer: flips the profile fields to inputs. Reset
	// whenever a different person is opened or the drawer closes.
	const [editing, setEditing] = createSignal(false);
	const [displayed, setDisplayed] = createSignal<Row[]>([]);
	const [focusedRow, setFocusedRow] = createSignal<Row>();
	const [checked, setChecked] = createSignal<Row[]>([]);
	let focusApi: { advance: () => void } | undefined;

	createEffect(
		on(
			() => (open() ? selection.selectedId() : undefined),
			() => {
				setEditing(false);
			}
		)
	);

	const nav = createDrawerNav({
		items: displayed,
		currentId: () => selected()?._id,
		onSelect: (row) => {
			selection.openRow(row);
		},
	});

	createActionKeys<Row>({
		// Wrapped, not passed by reference: reading `props.actions` directly here
		// (outside a tracked scope) would fix the accessor at setup; the arrow
		// defers the read into `createActionKeys`' own tracked scope.
		actions: () => props.actions(),
		// The drawer wins over the roster: whoever it shows is who you are looking
		// at, whatever the ring or the checkboxes say underneath it.
		drawerPerson: () => (open() ? selected() : undefined),
		selected: checked,
		focused: focusedRow,
		onAdvance: () => {
			focusApi?.advance();
		},
		onClearSelection: () => {
			setChecked([]);
		},
		// Live when this tab is on screen, or its drawer is up — the selection
		// alone cannot express the idle-on-screen case.
		active: () => (props.tab.active ?? false) || open(),
	});

	// A tab's own row-scoped keys, bound once at setup (the callback registers
	// hotkeys and is handed `focusedRow` as an accessor, not a read value —
	// `focusedRow` is already cleared whenever the ring is not the target, so
	// they fire only when they should). A one-time setup call, like
	// `createActionKeys` above, not a reactive read.
	// eslint-disable-next-line solid/reactivity -- one-time setup; focusedRow passed as an accessor
	props.focusedRowKeys?.(focusedRow);

	async function runBatch(
		rows: Row[],
		action: (id: Id<"people">) => Promise<unknown>,
		clearSelection: () => void
	): Promise<void> {
		for (const row of rows) {
			await action(row._id);
		}
		clearSelection();
	}

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
				onFocusedRowChange={setFocusedRow}
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
					{(p) => props.batchActions({ ...p, runBatch })}
				</Table.BatchActions>
			</Table.Root>
			<Drawer.Root
				open={open()}
				onOpenChange={(v) => {
					if (!v) selection.close();
				}}
			>
				<Drawer.Header>
					<Drawer.Title loading={props.data() === undefined}>
						{`${selected()?.firstName ?? ""} ${selected()?.lastName ?? ""}`.trim()}
					</Drawer.Title>
					<Drawer.HeaderActions>
						<EditToggle
							editing={editing()}
							enabled={open()}
							onToggle={() => {
								setEditing((e) => !e);
							}}
						/>
						<DrawerNav
							onPrev={nav.prev}
							onNext={nav.next}
							hasPrev={nav.hasPrev()}
							hasNext={nav.hasNext()}
						/>
						<Drawer.Close />
					</Drawer.HeaderActions>
				</Drawer.Header>
				<Drawer.Body
					loading={props.data() === undefined}
					skeleton={<PersonDetailPlaceholder />}
				>
					<Show when={selected()}>
						{(person) => (
							<PersonDetail
								person={person()}
								editing={editing()}
							/>
						)}
					</Show>
				</Drawer.Body>
				<Show when={selected()}>
					{(person) => (
						<Drawer.Footer>
							<div class={styles.footer}>
								{props.footerLead?.(person())}
								<div class={styles.footerActions}>
									<DecisionBar
										person={person()}
										actions={props.actions()}
									/>
								</div>
							</div>
						</Drawer.Footer>
					)}
				</Show>
			</Drawer.Root>
			{props.extra}
		</>
	);
}
