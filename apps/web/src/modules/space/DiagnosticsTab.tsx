import { Button, Table, type JfColumnDefinition } from "@j-os/design-system";
import { Show, createMemo, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { DOOR_LOG_PAGE_SIZE } from "../../../convex/lib/constants.ts";
import { useFlooredLog } from "../../shared/data/useFlooredLog.ts";
import { dayLabel } from "../../shared/time.ts";

import styles from "./DiagnosticsTab.module.scss";
import { toDoorText, type LogRow } from "./doorLog.ts";
import { LockHealthCard } from "./LockHealthCard.tsx";

type AuthLogRow = Pick<LogRow, "at" | "operation" | "trigger" | "outcome"> & {
	id: string;
	day: string;
	person: string;
	locks: string;
	toDoor: string;
	noResponse: boolean;
};

// Typed `Record<union, string>` so a new schema member is a compile error here
// and not a filter option that quietly never shows.
const operationLabels: Record<LogRow["operation"], string> = {
	grant: "Grant",
	revoke: "Revoke",
	unlock: "Unlock",
	lock: "Lock",
};

const triggerLabels: Record<LogRow["trigger"], string> = {
	cron: "Cron",
	lifecycle: "Lifecycle",
	override: "Override",
	onboarding: "Onboarding",
	resend: "Resend",
	gc: "GC",
	app: "App",
	switchover: "Switchover",
};

const outcomeLabels: Record<LogRow["outcome"], string> = {
	ok: "Ok",
	partial: "Partial",
	failed: "Failed",
	"dry-run": "Dry run",
	busy: "Busy",
};

function enumOptions<Member extends string>(
	labels: Record<Member, string>
): { value: Member; label: string }[] {
	return Object.entries<string>(labels).map(([value, label]) => ({
		value: value as Member,
		label,
	}));
}

const columns: JfColumnDefinition<AuthLogRow>[] = [
	{
		// Hidden grouping column (`Table` hides whatever it groups by): one
		// group per local day, so the virtualiser has groups to window.
		id: "day",
		header: "Day",
		dataType: "string",
		accessorFn: (row) => row.day,
	},
	{
		id: "at",
		header: "Time",
		dataType: "date",
		size: "content",
		accessorFn: (row) => row.at,
		cell: (info) => formatTime(info.row.original.at),
		measureText: (row) => formatTime(row.at),
	},
	{ accessorKey: "person", header: "Person", dataType: "string" },
	{
		accessorKey: "operation",
		header: "Operation",
		dataType: "enum",
		size: "content",
		enumOptions: enumOptions(operationLabels),
	},
	{
		accessorKey: "trigger",
		header: "Trigger",
		dataType: "enum",
		size: "content",
		enumOptions: enumOptions(triggerLabels),
	},
	{
		accessorKey: "locks",
		header: "Locks",
		dataType: "string",
		size: { min: "content", weight: 2 },
	},
	{
		accessorKey: "outcome",
		header: "Outcome",
		dataType: "enum",
		size: "content",
		enumOptions: enumOptions(outcomeLabels),
	},
	{
		accessorKey: "toDoor",
		header: "To door",
		dataType: "string",
		size: "content",
		cell: (info) => (
			<span
				class={
					info.row.original.noResponse ? styles.noResponse : undefined
				}
			>
				{info.row.original.toDoor}
			</span>
		),
	},
];

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function formatTime(ms: number): string {
	return timeFormat.format(new Date(ms));
}

function toRow(row: LogRow, now: number): AuthLogRow {
	return {
		id: row._id,
		day: dayLabel(row.at, now),
		at: row.at,
		person: row.name,
		operation: row.operation,
		trigger: row.trigger,
		locks: row.lockNames.length > 0 ? row.lockNames.join(", ") : "—",
		outcome: row.outcome,
		toDoor: toDoorText(row),
		noResponse: row.actuation === "unconfirmed",
	};
}

/**
 * Board-only door ops view: per-lock reachability plus every grant, revoke
 * and app unlock the app has recorded since this log existed. The log is one
 * continuous list: the recent rows are a live query, older ones load quietly
 * in the background as the table's rendered window nears its last row.
 */
export function DiagnosticsTab(): JSX.Element {
	const log = useFlooredLog({
		queries: api.doorLog,
		pageSize: DOOR_LOG_PAGE_SIZE,
		start: () => true,
	});

	const rows = createMemo<AuthLogRow[] | undefined>(() => {
		const now = Date.now();
		return log.rows()?.map((row) => toRow(row, now));
	});

	return (
		<div class={styles.panel}>
			<LockHealthCard />
			<section class={styles.log}>
				<h2 class={styles.heading}>Door log</h2>
				<Show
					when={!log.failed()}
					fallback={
						<p class={styles.empty}>Couldn't load the log.</p>
					}
				>
					{/* One table throughout: it shows its own skeleton rows
					    while `rows()` is undefined, then its rows in place. */}
					<div class={styles.table}>
						<Table.Root
							columns={columns}
							data={rows()}
							getRowId={(row) => row.id}
							groupBy="day"
							virtualize
							loadingMore={log.loadingMore()}
							onEndReached={() => {
								// A failed page waits for "Try again": the end
								// is still in view, so retrying here would
								// loop while offline.
								if (!log.loadMoreFailed()) void log.loadMore();
							}}
						>
							<Table.Empty>
								<p class={styles.empty}>
									No door operations recorded yet.
								</p>
							</Table.Empty>
						</Table.Root>
					</div>
				</Show>
				<Show when={log.loadMoreFailed()}>
					<div class={styles.retry}>
						<p class={styles.empty}>Couldn't load older entries.</p>
						<Button
							variant="tertiary"
							onClick={() => {
								void log.loadMore();
							}}
						>
							Try again
						</Button>
					</div>
				</Show>
			</section>
		</div>
	);
}
