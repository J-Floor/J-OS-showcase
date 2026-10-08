import { Table, type JfColumnDef } from "@j-os/design-system";
import { Show, createMemo, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { DOOR_LOG_PAGE_SIZE } from "../../../convex/lib/constants.ts";
import { useFlooredLog } from "../../shared/data/useFlooredLog.ts";
import { dayLabel } from "../../shared/time.ts";

import styles from "./DiagnosticsTab.module.scss";
import { toDoorText, type LogRow } from "./doorLog.ts";
import { LockHealthCard } from "./LockHealthCard.tsx";

type AuthLogRow = {
	id: string;
	day: string;
	at: number;
	person: string;
	operation: string;
	trigger: string;
	locks: string;
	outcome: string;
	toDoor: string;
	noResponse: boolean;
};

const triggerOptions = [
	{ value: "cron", label: "Cron" },
	{ value: "lifecycle", label: "Lifecycle" },
	{ value: "override", label: "Override" },
	{ value: "onboarding", label: "Onboarding" },
	{ value: "resend", label: "Resend" },
	{ value: "gc", label: "GC" },
	{ value: "app", label: "App" },
	{ value: "switchover", label: "Switchover" },
] as const;

const columns: JfColumnDef<AuthLogRow>[] = [
	{
		// Hidden grouping column (`Table` hides whatever it groups by): one
		// group per local day, so the virtualiser has groups to window.
		id: "day",
		header: "Day",
		dataType: "string",
		accessorFn: (r) => r.day,
	},
	{
		id: "at",
		header: "Time",
		dataType: "date",
		size: 110,
		accessorFn: (r) => r.at,
		cell: (info) => formatTime(info.row.original.at),
	},
	{ accessorKey: "person", header: "Person", dataType: "string", size: 200 },
	{
		accessorKey: "operation",
		header: "Operation",
		dataType: "enum",
		size: 120,
		enumOptions: [
			{ value: "grant", label: "Grant" },
			{ value: "revoke", label: "Revoke" },
			{ value: "unlock", label: "Unlock" },
			{ value: "lock", label: "Lock" },
		],
	},
	{
		accessorKey: "trigger",
		header: "Trigger",
		dataType: "enum",
		size: 130,
		enumOptions: [...triggerOptions],
	},
	{ accessorKey: "locks", header: "Locks", dataType: "string", size: 280 },
	{
		accessorKey: "outcome",
		header: "Outcome",
		dataType: "enum",
		size: 120,
		enumOptions: [
			{ value: "ok", label: "Ok" },
			{ value: "partial", label: "Partial" },
			{ value: "failed", label: "Failed" },
			{ value: "dry-run", label: "Dry run" },
			{ value: "busy", label: "Busy" },
		],
	},
	{
		accessorKey: "toDoor",
		header: "To door",
		dataType: "string",
		size: 110,
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

function formatTime(ms: number): string {
	return new Date(ms).toLocaleTimeString(undefined, { timeStyle: "short" });
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
					{/* `rows()` is `undefined` while the query is loading — Table.Root
					    renders its own skeleton rows for that case, and the empty
					    state below only applies once the log has actually loaded
					    with nothing in it. */}
					<Show
						when={rows()?.length !== 0}
						fallback={
							<p class={styles.empty}>
								No door operations recorded yet.
							</p>
						}
					>
						<div class={styles.table}>
							<Table.Root
								columns={columns}
								data={rows()}
								groupBy="day"
								virtualize
								onEndReached={() => {
									void log.loadMore();
								}}
							/>
						</div>
					</Show>
				</Show>
				<Show when={log.loadFailed()}>
					<p class={styles.empty}>Couldn't load older entries.</p>
				</Show>
				<Show when={log.loading()}>
					<p class={styles.empty}>Loading older entries…</p>
				</Show>
			</section>
		</div>
	);
}
