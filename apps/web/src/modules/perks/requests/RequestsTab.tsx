import {
	Button,
	EmptyState,
	Icon,
	Segment,
	Table,
	Tabs,
} from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createSignal, For, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import {
	PERK_REQUEST_LIST_CAP,
	siteToday,
} from "../../../../convex/lib/perks.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { downloadBlob } from "../../../shared/downloadBlob.ts";
import { warmPeek } from "../../../shared/entity/lazyPeek.tsx";
import { useOpenPeek } from "../../../shared/entity/openEntity.ts";
import { PEEK_PARAM } from "../../../shared/entity/peekParam.ts";
import { ICONS } from "../../../shared/icons.ts";
import { perksEntity, prefetchPerkSheet } from "../entity.ts";

import {
	REQUEST_GROUP_COLUMN,
	REQUEST_GROUPINGS,
	requestColumns,
	requestSorting,
	type RequestGrouping,
} from "./requestColumns.tsx";
import styles from "./RequestsTab.module.scss";
import { perkRequestsCsv } from "./toCsv.ts";

type Rows = Accessor<PerkRequestRow[] | undefined>;

/** The line above a table the query filled to its cap: "Showing the newest
 *  2,000 requests." Older requests exist but are not shown, nor in the CSV. */
export function capNotice(cap: number): string {
	return `Showing the newest ${cap.toLocaleString("en-GB")} requests.`;
}

/** Every loaded row, whatever the grouping, as `perk-requests-<today>.csv`. */
function DownloadCsvButton(props: { rows: Rows }): JSX.Element {
	function download() {
		const csv = perkRequestsCsv(props.rows() ?? []);
		downloadBlob(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
			`perk-requests-${siteToday(Date.now())}.csv`
		);
	}
	return (
		<Button
			variant="secondary"
			disabled={(props.rows()?.length ?? 0) === 0}
			disabledReason={
				props.rows() === undefined
					? "Loading requests…"
					: "No requests to download"
			}
			onClick={download}
		>
			<Icon>{ICONS.download}</Icon> Download CSV
		</Button>
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

/** One grouping's table. A row opens its perk's sheet; the status select
 *  edits in place. */
function RequestsTable(props: {
	grouping: RequestGrouping;
	rows: Rows;
}): JSX.Element {
	const [params] = useSearchParams();
	const openPeek = useOpenPeek();
	// A peek, not the page's own `?perk=`: that param belongs to the Perks
	// tab, and writing it would pull the board over there to open the sheet.
	function openPerk(row: PerkRequestRow) {
		openPeek(perksEntity, row.perkId);
	}
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
			focusableRows
			// The peek owns the keyboard while it is open.
			suppressFocus={params[PEEK_PARAM] !== undefined}
			onRowClick={openPerk}
			onRowActivate={openPerk}
			onRowHoverIntent={(row) => {
				warmPeek(perksEntity);
				prefetchPerkSheet(row.perkId);
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

/**
 * Board/admin: every perk request, newest first, grouped by status (or by
 * perk, requester or month), each status editable in place. A row opens its
 * perk's sheet over the tab. The page mounts it the first time its tab is
 * shown, so the query starts then.
 */
export function RequestsTab(): JSX.Element {
	const list = useQuery(api.perkRequests.listPerkRequests, {});
	function rows(): PerkRequestRow[] | undefined {
		return list.data()?.requests;
	}
	// Local to the tab: a reload starts on Status again.
	const [grouping, setGrouping] = createSignal<RequestGrouping>("status");
	return (
		<div class={styles.tab}>
			<Tabs.Actions value="requests">
				<DownloadCsvButton rows={rows} />
			</Tabs.Actions>
			<RequestsBar
				capped={() => list.data()?.capped ?? false}
				grouping={grouping}
				onGroupingChange={setGrouping}
			/>
			<div class={styles.table}>
				{/* `Table` reads `groupBy` and its opening sort once, at
				    setup: each grouping gets a table of its own. */}
				<Show when={grouping()} keyed>
					{(current) => (
						<RequestsTable grouping={current} rows={rows} />
					)}
				</Show>
			</div>
		</div>
	);
}
