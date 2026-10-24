import type { Table as TanTable } from "@tanstack/solid-table";
import { type JSX, Show } from "solid-js";

import { ICONS } from "../../icons.ts";
import { createSlotPart } from "../../utils/presence.tsx";
import { Button } from "../Button/Button.tsx";
import { EmptyState } from "../EmptyState/EmptyState.tsx";

/** `Table.Root` wraps its tree in `emptyPart.Scope`; the empty row shows
 *  `EmptyContent`. */
export const emptyPart = createSlotPart("Table", "Empty", "Table.Root");

export type TableEmptyProps = Parameters<typeof emptyPart.Part>[0];

/**
 * Replaces the table's default empty content: its children show in the
 * table's body, in one row spanning every column, when there are no rows to
 * show (typically an `EmptyState`). A child of `Table.Root`; it renders
 * nothing where it is placed.
 *
 * The default only knows the table's own column filters; the table has no
 * global filter. An app that narrows `data` with its own search hands the
 * table no rows, which reads as "nothing here yet": while its search hides
 * every row, it passes a `Table.Empty` saying "No matches" instead.
 */
export const Empty: (props: TableEmptyProps) => JSX.Element = emptyPart.Part;

/**
 * The default empty content: "No matches" with a way out when column filters
 * hide every row, the generic empty state when there are no rows. Rows an
 * app filters out before handing them in count as no rows (see `Empty`).
 */
function DefaultEmpty<Data extends Record<string, unknown>>(props: {
	table: TanTable<Data>;
}): JSX.Element {
	function filteredOut(): boolean {
		return props.table.getCoreRowModel().rows.length > 0;
	}
	return (
		<Show when={filteredOut()} fallback={<EmptyState />}>
			<EmptyState icon={ICONS.noMatches} title="No matches">
				<Button
					variant="secondary"
					onClick={() => {
						props.table.resetColumnFilters(true);
					}}
				>
					Clear filters
				</Button>
			</EmptyState>
		</Show>
	);
}

/** What the empty row shows: a `Table.Empty` child, else the default. */
export function EmptyContent<Data extends Record<string, unknown>>(props: {
	table: TanTable<Data>;
}): JSX.Element {
	return <emptyPart.Slot fallback={<DefaultEmpty table={props.table} />} />;
}
