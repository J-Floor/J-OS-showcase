import { EmptyState, Segment, Table, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createSignal, For, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { PERK_REQUEST_LIST_CAP } from "../../../../convex/lib/perks.ts";
import { LOCALE, SITE_TIMEZONE, todayIn } from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import {
	createSheetNav,
	type SheetNavState,
} from "../../../lib/createSheetNav.ts";
import { ActionButton } from "../../../shared/actions/ActionButton.tsx";
import { bindPageKeys } from "../../../shared/actions/sheetActions.tsx";
import {
	PAGE_TARGET,
	type ActionDescriptor,
	type PageTarget,
} from "../../../shared/actions/shortcuts.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { downloadBlob } from "../../../shared/downloadBlob.ts";
import {
	createEntitySelection,
	type EntitySelection,
} from "../../../shared/entity/createEntitySelection.ts";
import { PEEK_PARAM } from "../../../shared/entity/peekParam.ts";
import { ICONS } from "../../../shared/icons.ts";

import {
	REQUEST_GROUP_COLUMN,
	REQUEST_GROUPINGS,
	requestColumns,
	requestSorting,
	type RequestGrouping,
} from "./requestColumns.tsx";
import { requestEntity } from "./requestEntity.ts";
import { prefetchRequestSheet } from "./requestQueries.ts";
import { RequestSheet } from "./RequestSheet.tsx";
import styles from "./RequestsTab.module.scss";
import { perkRequestsCsv } from "./toCsv.ts";

type Rows = Accessor<PerkRequestRow[] | undefined>;

/** The line above a table the query filled to its cap: "Showing the newest
 *  2,000 requests." Older requests exist but are not shown, nor in the CSV. */
export function capNotice(cap: number): string {
	return `Showing the newest ${cap.toLocaleString(LOCALE)} requests.`;
}

/** Every loaded row, whatever the grouping, as `perk-requests-<today>.csv`.
 *  `D` downloads while `active`, and only with rows to download. */
function DownloadCsvButton(props: {
	rows: Rows;
	active: Accessor<boolean>;
}): JSX.Element {
	const download: ActionDescriptor<PageTarget> = {
		id: "download-csv",
		label: "Download CSV",
		icon: ICONS.download,
		hotkey: "D",
		can: () => (props.rows()?.length ?? 0) > 0,
		disabledReason: () =>
			props.rows() === undefined
				? "Loading requests…"
				: "No requests to download",
		run: () => {
			const csv = perkRequestsCsv(props.rows() ?? []);
			downloadBlob(
				new Blob([csv], { type: "text/csv;charset=utf-8" }),
				`perk-requests-${todayIn(SITE_TIMEZONE, Date.now())}.csv`
			);
		},
	};
	// eslint-disable-next-line solid/reactivity -- read by the keys' own tracked options
	bindPageKeys("perk-requests", [download], () => props.active());
	return (
		<ActionButton
			action={download}
			target={PAGE_TARGET}
			variant="secondary"
		/>
	);
}

/** Above the table: the group-by switch, and the cap notice once the query
 *  has read all it may (`capped`, which counts rows before the join drops
 *  any). */
function RequestsBar(props: {
	capped: Accessor<boolean>;
	grouping: Accessor<RequestGrouping>;
	onGroupingChange: (grouping: RequestGrouping) => void;
}): JSX.Element {
	return (
		<div class={styles.bar}>
			<Segment.Root
				label="Group by"
				orientation="horizontal"
				value={props.grouping()}
				onValueChange={(details) => {
					const next = REQUEST_GROUPINGS.find(
						(option) => option.value === details.value
					);
					if (next) props.onGroupingChange(next.value);
				}}
			>
				<For each={REQUEST_GROUPINGS}>
					{(option) => (
						<Segment.Item
							value={option.value}
							class={styles.option}
						>
							{option.label}
						</Segment.Item>
					)}
				</For>
			</Segment.Root>
			<Show when={props.capped()}>
				<p class={styles.cap}>{capNotice(PERK_REQUEST_LIST_CAP)}</p>
			</Show>
		</div>
	);
}

/** One grouping's table. A row opens its request's sheet on the tab, which
 *  morphs out of the row and back into it; the status select edits in
 *  place. */
function RequestsTable(props: {
	grouping: RequestGrouping;
	rows: Rows;
	selection: EntitySelection<PerkRequestRow>;
	onDisplayedRowsChange: (rows: PerkRequestRow[]) => void;
}): JSX.Element {
	const [params] = useSearchParams();
	return (
		<Table.Root
			columns={requestColumns(props.grouping)}
			data={props.rows()}
			getRowId={(row) => row._id}
			groupBy={REQUEST_GROUP_COLUMN}
			// Up to 2,000 rows, each with a status select: only a window of
			// them mounts. The `.table` box around gives it a bounded height.
			virtualize
			initialColumnSorting={requestSorting(props.grouping)}
			onDisplayedRowsChange={props.onDisplayedRowsChange}
			focusableRows
			// The sheet, or a peek opened over it, owns the keyboard.
			suppressFocus={
				props.selection.open() || params[PEEK_PARAM] !== undefined
			}
			onRowClick={props.selection.openRow}
			onRowActivate={props.selection.openRow}
			onRowHoverIntent={(row) => {
				prefetchRequestSheet(row._id);
				props.selection.intend();
			}}
		>
			<Table.Empty>
				<EmptyState
					icon={ICONS.perks}
					title="No requests yet"
					description="When a member requests a perk, it shows up here."
				/>
			</Table.Empty>
		</Table.Root>
	);
}

/** The tab's request sheet, on `?request=<id>`: a row, the bell or an email
 *  opens it, Back closes it. Prev/next walk the rows as the table shows
 *  them (grouped and sorted). A link that lands on another tab asks for
 *  this one first (`onNeedTab`). */
function createRequestSelection(options: {
	rows: Rows;
	active: Accessor<boolean>;
	onNeedTab: () => void;
}): {
	selection: EntitySelection<PerkRequestRow>;
	nav: SheetNavState;
	setDisplayed: (rows: PerkRequestRow[]) => void;
} {
	const selection = createEntitySelection<PerkRequestRow>({
		rows: options.rows,
		param: requestEntity.param,
		active: options.active,
		onNeedTab: options.onNeedTab,
	});
	const [displayed, setDisplayed] = createSignal<PerkRequestRow[]>([]);
	const nav = createSheetNav({
		items: displayed,
		currentId: selection.requestedId,
		onSelect: selection.openRow,
	});
	return { selection, nav, setDisplayed };
}

/**
 * Board/admin: every perk request, newest first, grouped by status (or by
 * perk, requester or month), each status editable in place. A row, or a
 * request's link (`?request=<id>`), opens the request's sheet on the tab.
 * The page mounts it the first time its tab is shown, or a request link
 * arrives, so the query starts then.
 */
export function RequestsTab(props: {
	/** Whether the Requests tab is the one on screen: the tab stays mounted
	 *  behind the others, and its `D` key and `?request=` must not act from
	 *  them. */
	active: Accessor<boolean>;
	/** A `?request=` link arrived while another tab was showing: switch to
	 *  this one so the sheet can open. */
	onNeedTab?: () => void;
}): JSX.Element {
	const [params] = useSearchParams();
	const list = useQuery(api.perkRequests.listPerkRequests, {});
	function rows(): PerkRequestRow[] | undefined {
		return list.data()?.requests;
	}
	const { selection, nav, setDisplayed } = createRequestSelection({
		rows,
		active: () => props.active(),
		onNeedTab: () => {
			props.onNeedTab?.();
		},
	});
	// Local to the tab: a reload starts on Status again.
	const [grouping, setGrouping] = createSignal<RequestGrouping>("status");
	return (
		<div class={styles.tab}>
			<Tabs.Actions value="requests">
				<DownloadCsvButton
					rows={rows}
					// The sheet, or a peek over the tab, owns the keyboard.
					active={() =>
						props.active() &&
						!selection.open() &&
						params[PEEK_PARAM] === undefined
					}
				/>
			</Tabs.Actions>
			<RequestsBar
				capped={() => list.data()?.capped ?? false}
				grouping={grouping}
				onGroupingChange={setGrouping}
			/>
			{/* A press on a row builds the sheet's parts, as resting on one
			    does (`intend` on hover intent): a touch has no hover, and a
			    first open with no parts built has no values to fly. */}
			<div
				class={styles.table}
				onPointerDown={() => {
					selection.intend();
				}}
			>
				{/* `Table` reads `groupBy` and its opening sort once, at
				    setup: each grouping gets a table of its own. The sheet
				    stays outside, so a regroup does not remount it. */}
				<Show when={grouping()} keyed>
					{(current) => (
						<RequestsTable
							grouping={current}
							rows={rows}
							selection={selection}
							onDisplayedRowsChange={setDisplayed}
						/>
					)}
				</Show>
			</div>
			<RequestSheet
				open={selection.open()}
				prebuild={selection.prebuild()}
				onOpenChange={(isOpen) => {
					if (!isOpen) selection.close();
				}}
				request={selection.selected()}
				loading={selection.loading()}
				nav={nav}
			/>
		</div>
	);
}
