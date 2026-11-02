import { Show, createSignal, onCleanup, type JSX } from "solid-js";
import { Button, EmptyState, Icon, Table } from "@j-os/design-system";

import type { JfColumnDefinition } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Table.demo.module.scss";

type Entry = { id: string; batchId: string; batchName: string };

const ENDLESS_CHUNK = 50;
const ENDLESS_MAX = 500;

const endlessColumns: JfColumnDefinition<Entry>[] = [
	// Groups on the batch id and names each group from its first row.
	{
		id: "batch",
		header: "Batch",
		dataType: "string",
		accessorFn: (r) => r.batchId,
		groupLabel: (r) => r.batchName,
	},
	{ accessorKey: "id", header: "Entry", dataType: "string" },
];

function entries(from: number): Entry[] {
	return Array.from({ length: ENDLESS_CHUNK }, (_, i) => {
		const n = from + i;
		const batch = String(Math.floor(n / ENDLESS_CHUNK) + 1);
		return {
			id: `Entry ${String(n + 1)}`,
			batchId: `batch-${batch}`,
			batchName: `Batch ${batch}`,
		};
	});
}

const ENDLESS_DELAY_MS = 600;

/** A virtualised table that appends a chunk each time its end nears, with
 *  skeleton rows while the chunk "loads". Grouped by batch, or flat rows;
 *  arrow keys move a ring that scrolls the window to its row. */
function EndlessTable(props: { grouped: boolean }): JSX.Element {
	const [rows, setRows] = createSignal(entries(0));
	const [loadingMore, setLoadingMore] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(timer);
	});
	return (
		<div class={styles.endless}>
			<Table.Root
				columns={endlessColumns}
				getRowId={(row) => row.id}
				data={rows()}
				groupBy={props.grouped ? "batch" : undefined}
				virtualize
				focusableRows
				loadingMore={loadingMore()}
				onEndReached={() => {
					if (rows().length >= ENDLESS_MAX) return;
					setLoadingMore(true);
					timer = setTimeout(() => {
						setRows((prev) => [...prev, ...entries(prev.length)]);
						setLoadingMore(false);
					}, ENDLESS_DELAY_MS);
				}}
			/>
		</div>
	);
}

type Item = {
	name: string;
	role: string;
	age: number;
	shift: string;
	onSite: boolean;
	bio: string;
};

/** One column per sizing form: omitted (at least its widest cell, plus a
 *  share of the rest), `"content"`, a fixed width, and a floor with a weight
 *  for free text that should wrap rather than grow. The role column stores
 *  keys and shows (and is sized by) its option labels. */
const columns: JfColumnDefinition<Item>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{
		accessorKey: "role",
		header: "Role",
		dataType: "enum",
		size: "content",
		enumOptions: [
			{ value: "eng", label: "Engineer" },
			{ value: "research", label: "Researcher" },
			{ value: "navy", label: "Admiral" },
		],
	},
	{ accessorKey: "age", header: "Age", dataType: "number", size: 96 },
	{
		accessorKey: "shift",
		header: "Shift",
		dataType: "time",
		size: "content",
	},
	{
		accessorKey: "onSite",
		header: "On site",
		dataType: "boolean",
		size: "content",
		cell: (info) => (info.row.original.onSite ? "Yes" : "No"),
		measureText: (r) => (r.onSite ? "Yes" : "No"),
	},
	{
		accessorKey: "bio",
		header: "Bio",
		dataType: "string",
		size: { min: 200, weight: 2 },
		measureText: false,
	},
];

const data: Item[] = [
	{
		name: "Ada Lovelace",
		role: "eng",
		age: 36,
		shift: "09:00",
		onSite: true,
		bio: "Wrote the first program for a machine that was never finished.",
	},
	{
		name: "Alan Turing",
		role: "research",
		age: 41,
		shift: "13:30",
		onSite: false,
		bio: "Asked whether machines can think, then built one to find out.",
	},
	{
		name: "Grace Hopper",
		role: "navy",
		age: 85,
		shift: "18:00",
		onSite: true,
		bio: "Found the first actual bug and kept it in the logbook.",
	},
	{
		name: "Margaret Hamilton",
		role: "eng",
		age: 33,
		shift: "07:00",
		onSite: true,
		bio: "Wrote the flight software that landed on the Moon.",
	},
	{
		name: "Katherine Johnson",
		role: "research",
		age: 50,
		shift: "11:00",
		onSite: false,
		bio: "Checked the orbit by hand before anyone trusted the computer.",
	},
	{
		name: "Edsger Dijkstra",
		role: "research",
		age: 42,
		shift: "15:00",
		onSite: true,
		bio: "Found the shortest path and argued against goto.",
	},
];

/** The batch bar's actions, reading the checked rows from the table. */
function SelectionActions(): JSX.Element {
	const selection = Table.useSelection<Item>();
	return (
		<>
			<Button
				onClick={() =>
					// eslint-disable-next-line no-console -- demo action
					console.log(
						"Promote:",
						selection.rows().map((row) => row.name)
					)
				}
			>
				<Icon>arrow_upward</Icon>Promote {selection.count()}
			</Button>
			<Button
				variant="secondary"
				onClick={() => {
					// eslint-disable-next-line no-console -- demo action
					console.log("Export:", selection.rows());
					selection.clear();
				}}
			>
				<Icon>download</Icon>Export
			</Button>
		</>
	);
}

function tableData(p: { loading?: boolean; empty?: boolean }) {
	if (p.loading) return undefined;
	return p.empty ? [] : data;
}

export default {
	title: "Table",
	// `enableRowSelection`, `groupBy` and `headerColumn` are read once when
	// `Table.Root` builds its table; the keyed <Show> remounts the table when
	// those controls change so the preview reflects them (real usage passes
	// these statically).
	render: (p) => (
		<Show
			when={!p.endless}
			fallback={
				<Show when={String(p.grouped)} keyed>
					<EndlessTable grouped={p.grouped} />
				</Show>
			}
		>
			<Show
				when={`${String(p.enableRowSelection)}|${String(p.grouped)}|${String(p.headerColumn)}`}
				keyed
			>
				<Table.Root
					columns={columns}
					data={tableData(p)}
					getRowId={(row) => row.name}
					enableRowSelection={p.enableRowSelection}
					stickyHeader={p.stickyHeader}
					headerColumn={p.headerColumn}
					groupBy={p.grouped ? "role" : undefined}
				>
					{/* The bar shows only while a row is checked; its actions
					    read the selection with Table.useSelection. */}
					<Table.BatchActions>
						<SelectionActions />
					</Table.BatchActions>
					<Show when={p.customEmpty}>
						<Table.Empty>
							<EmptyState
								icon="add"
								title="No entries yet"
								description="Add the first one to get started."
							/>
						</Table.Empty>
					</Show>
				</Table.Root>
			</Show>
		</Show>
	),
	controls: {
		enableRowSelection: { type: "boolean", default: true },
		stickyHeader: { type: "boolean", default: true },
		headerColumn: { type: "boolean", default: false },
		grouped: { type: "boolean", default: false },
		loading: { type: "boolean", default: false },
		empty: { type: "boolean", default: false },
		customEmpty: { type: "boolean", default: false },
		endless: { type: "boolean", default: false },
	},
	presets: {
		"No selection": { enableRowSelection: false },
		"Grouped by role": { grouped: true },
		"Row headers": { headerColumn: true },
		Loading: { loading: true },
		"No rows": { empty: true },
		"Custom empty state": { empty: true, customEmpty: true },
		"Load more at the end": { endless: true, grouped: true },
		"Windowed flat rows": { endless: true },
	},
} satisfies Demo;
