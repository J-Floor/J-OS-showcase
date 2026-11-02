import { EmptyState, Segment, Table, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import {
	createEffect,
	createSignal,
	For,
	Show,
	type Accessor,
	type JSX,
} from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { PERK_REQUEST_LIST_CAP } from "../../../../convex/lib/perks.ts";
import { LOCALE, SITE_TIMEZONE, todayIn } from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { ActionButton } from "../../../shared/actions/ActionButton.tsx";
import { bindPageKeys } from "../../../shared/actions/sheetActions.tsx";
import {
	PAGE_TARGET,
	type ActionDescriptor,
	type PageTarget,
} from "../../../shared/actions/shortcuts.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { downloadBlob } from "../../../shared/downloadBlob.ts";
import { warmPeek } from "../../../shared/entity/lazyPeek.tsx";
import { useOpenPeek } from "../../../shared/entity/openEntity.ts";
import { PEEK_PARAM, peekValue } from "../../../shared/entity/peekParam.ts";
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

/** One grouping's table. A row opens its request's sheet, which morphs
 *  out of the row and back into it; the status select edits in place. */
function RequestsTable(props: {
	grouping: RequestGrouping;
	rows: Rows;
}): JSX.Element {
	const [params] = useSearchParams();
	const openPeek = useOpenPeek();
	function openRequest(row: PerkRequestRow) {
		openPeek(requestEntity, row._id);
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
			onRowClick={openRequest}
			onRowActivate={openRequest}
			onRowHoverIntent={(row) => {
				warmPeek(requestEntity);
				prefetchRequestSheet(row._id);
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

/** A request's link (`?request=<id>`, from the bell or an email) opens it
 *  as a peek over the tab, in the link's place: the peek is where a request
 *  shows, and the param left behind would open it again. */
function useRequestLink(): void {
	const [params, setParams] = useSearchParams();
	createEffect(() => {
		const requestId = params[requestEntity.param];
		if (typeof requestId !== "string" || requestId === "") return;
		setParams(
			{
				[requestEntity.param]: undefined,
				[PEEK_PARAM]: peekValue(requestEntity, requestId),
			},
			{ replace: true }
		);
	});
}

/**
 * Board/admin: every perk request, newest first, grouped by status (or by
 * perk, requester or month), each status editable in place. A row, or a
 * request's link, opens the request's sheet over the tab. The page mounts it
 * the first time its tab is shown, so the query starts then.
 */
export function RequestsTab(props: {
	/** Whether the Requests tab is the one on screen: the tab stays mounted
	 *  behind the others, and its `D` key must not fire from them. */
	active: Accessor<boolean>;
}): JSX.Element {
	const [params] = useSearchParams();
	const list = useQuery(api.perkRequests.listPerkRequests, {});
	useRequestLink();
	function rows(): PerkRequestRow[] | undefined {
		return list.data()?.requests;
	}
	// Local to the tab: a reload starts on Status again.
	const [grouping, setGrouping] = createSignal<RequestGrouping>("status");
	return (
		<div class={styles.tab}>
			<Tabs.Actions value="requests">
				<DownloadCsvButton
					rows={rows}
					// A peek over the tab owns the keyboard.
					active={() =>
						props.active() && params[PEEK_PARAM] === undefined
					}
				/>
			</Tabs.Actions>
			<RequestsBar
				capped={() => list.data()?.capped ?? false}
				grouping={grouping}
				onGroupingChange={setGrouping}
			/>
			{/* A press on a row loads the request's peek, as resting on one
			    does (`onRowHoverIntent`): a touch has no hover, and a peek
			    still loading on the first open has nothing to morph into. */}
			<div
				class={styles.table}
				onPointerDown={() => {
					warmPeek(requestEntity);
				}}
			>
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
