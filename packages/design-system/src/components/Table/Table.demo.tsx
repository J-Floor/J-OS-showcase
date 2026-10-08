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
};

const columns: JfColumnDef<Person>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "role", header: "Role", dataType: "string" },
	{ accessorKey: "age", header: "Age", dataType: "number" },
];

const data: Person[] = [
	{ name: "Ada Lovelace", role: "Engineer", age: 36 },
	{ name: "Alan Turing", role: "Researcher", age: 41 },
	{ name: "Grace Hopper", role: "Admiral", age: 85 },
];

export default {
	title: "Table",
	// `enableRowSelection` and `groupBy` are read once when `Table.Root` builds
	// its table; the keyed <Show> remounts the table when those controls change
	// so the preview reflects them (real usage passes these statically).
	render: (p) => (
		<Show when={!p.endless} fallback={<EndlessTable />}>
			<Show
				when={`${String(p.enableRowSelection)}|${String(p.grouped)}`}
				keyed
			>
				<Table.Root
					columns={columns}
					data={p.loading ? undefined : data}
					enableRowSelection={p.enableRowSelection}
					stickyHeader={p.stickyHeader}
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
		grouped: { type: "boolean", default: false },
		loading: { type: "boolean", default: false },
		endless: { type: "boolean", default: false },
	},
	presets: {
		"No selection": { enableRowSelection: false },
		"Grouped by role": { grouped: true },
		Loading: { loading: true },
		"Load more at the end": { endless: true },
	},
} satisfies Demo;
