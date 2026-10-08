import { Show, createSignal, type JSX } from "solid-js";
import { Button, Icon, Table } from "@j-os/design-system";

import type { JfColumnDef } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Table.demo.module.scss";

type Entry = { id: string; batch: string };

const ENDLESS_CHUNK = 50;
const ENDLESS_MAX = 500;

const endlessColumns: JfColumnDef<Entry>[] = [
	{
		id: "batch",
		header: "Batch",
		dataType: "string",
		accessorFn: (r) => r.batch,
	},
	{ accessorKey: "id", header: "Entry", dataType: "string" },
];

function entries(from: number): Entry[] {
	return Array.from({ length: ENDLESS_CHUNK }, (_, i) => {
		const n = from + i;
		return {
			id: `Entry ${String(n + 1)}`,
			batch: `Batch ${String(Math.floor(n / ENDLESS_CHUNK) + 1)}`,
		};
	});
}

/** A virtualised table that appends a chunk each time its end nears. */
function EndlessTable(): JSX.Element {
	const [rows, setRows] = createSignal(entries(0));
	return (
		<div class={styles.endless}>
			<Table.Root
				columns={endlessColumns}
				data={rows()}
				groupBy="batch"
				virtualize
				onEndReached={() => {
					if (rows().length >= ENDLESS_MAX) return;
					setRows((prev) => [...prev, ...entries(prev.length)]);
				}}
			/>
		</div>
	);
}

type Person = {
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
const columns: JfColumnDef<Person>[] = [
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

const data: Person[] = [
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
];

export default {
	title: "Table",
	// `enableRowSelection`, `groupBy` and `headerColumn` are read once when
	// `Table.Root` builds its table; the keyed <Show> remounts the table when
	// those controls change so the preview reflects them (real usage passes
	// these statically).
	render: (p) => (
		<Show when={!p.endless} fallback={<EndlessTable />}>
			<Show
				when={`${String(p.enableRowSelection)}|${String(p.grouped)}|${String(p.headerColumn)}`}
				keyed
			>
				<Table.Root
					columns={columns}
					data={p.loading ? undefined : data}
					enableRowSelection={p.enableRowSelection}
					stickyHeader={p.stickyHeader}
					headerColumn={p.headerColumn}
					groupBy={p.grouped ? "role" : undefined}
				>
					{/* Render-prop receives the live selection; the bar shows only
				    when at least one row is selected. */}
					<Table.BatchActions>
						{(batch) => (
							<>
								<Button
									onClick={() =>
										// eslint-disable-next-line no-console -- demo action
										console.log(
											"Promote:",
											batch.selectedRows.map(
												(r) => r.name
											)
										)
									}
								>
									<Icon>arrow_upward</Icon>Promote{" "}
									{batch.selectedCount}
								</Button>
								<Button
									variant="secondary"
									onClick={() => {
										// eslint-disable-next-line no-console -- demo action
										console.log(
											"Export:",
											batch.selectedRows
										);
										batch.clearSelection();
									}}
								>
									<Icon>download</Icon>Export
								</Button>
							</>
						)}
					</Table.BatchActions>
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
		endless: { type: "boolean", default: false },
	},
	presets: {
		"No selection": { enableRowSelection: false },
		"Grouped by role": { grouped: true },
		"Row headers": { headerColumn: true },
		Loading: { loading: true },
		"Load more at the end": { endless: true },
	},
} satisfies Demo;
