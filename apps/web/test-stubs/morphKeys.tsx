/**
 * What a morph pairs on, read the way the design system marks it: for app
 * tests asserting that a column, a sheet row and a card show the same field.
 * Reads the design system's own attribute names, never copies of them.
 */
import {
	ACTIONS_COLUMN_ID,
	type JfColumnDefinition,
	MORPH_KEY,
	MORPH_OF,
	MORPH_TITLE,
	SHEET_SKELETON,
	Table,
} from "@j-os/design-system";
import { cleanup, render } from "@solidjs/testing-library";

const KEYED = `[${MORPH_KEY}]`;
const TITLE = `[${MORPH_TITLE}]`;

/** The elements in `root` showing a field (with `key`, that field only),
 *  in document order. */
export function keyedIn(root: ParentNode, key?: string): HTMLElement[] {
	const selector = key === undefined ? KEYED : `[${MORPH_KEY}="${key}"]`;
	return [...root.querySelectorAll<HTMLElement>(selector)];
}

/** The first element in `root` showing `key`, if any. */
export function keyedValue(
	root: ParentNode | null | undefined,
	key: string
): HTMLElement | null {
	return root?.querySelector<HTMLElement>(`[${MORPH_KEY}="${key}"]`) ?? null;
}

/** The field key `element` carries, if any. */
export function morphKeyOf(element: Element | null | undefined): string | null {
	return element?.getAttribute(MORPH_KEY) ?? null;
}

/** The element showing a field that holds `element` (itself included). */
export function keyedAround(
	element: Element | null | undefined
): HTMLElement | null {
	return element?.closest<HTMLElement>(KEYED) ?? null;
}

/** The marked morph title holding `element` (itself included). */
export function titleAround(
	element: Element | null | undefined
): HTMLElement | null {
	return element?.closest<HTMLElement>(TITLE) ?? null;
}

/** The field key a morph title carries ("" for an unkeyed title). */
export function titleKeyOf(element: Element | null | undefined): string | null {
	return element?.getAttribute(MORPH_TITLE) ?? null;
}

/** The element in `root` marked as showing an entity (`Morph`). */
export function entityIn(root: ParentNode): HTMLElement | null {
	return root.querySelector<HTMLElement>(`[${MORPH_OF}]`);
}

/** The sheet loading skeleton in `root`, if one shows. */
export function sheetSkeleton(root: ParentNode = document): HTMLElement | null {
	return root.querySelector<HTMLElement>(`[${SHEET_SKELETON}]`);
}

/** The morph keys a table's first row carries, and its title cell's key.
 *  Renders the DS table with `columns` (minus the row actions, which need
 *  app context) and unmounts it again. */
export function tableRowKeys<Row extends Record<string, unknown>>(
	columns: JfColumnDefinition<Row>[],
	row: Row
): { cells: (string | null)[]; title: string | null } {
	render(() => (
		<Table.Root
			columns={columns.filter(
				(column) => column.id !== ACTIONS_COLUMN_ID
			)}
			data={[row]}
		/>
	));
	const first = document.querySelector("tbody tr");
	const keys = {
		cells: [...(first?.querySelectorAll(`td ${KEYED}`) ?? [])].map((cell) =>
			morphKeyOf(cell)
		),
		title: titleKeyOf(first?.querySelector(TITLE)),
	};
	cleanup();
	return keys;
}

/** The morph keys of the open sheet's live content, in document order:
 *  nothing inside its loading skeleton. */
export function sheetKeys(): (string | null)[] {
	return keyedIn(document)
		.filter((element) => element.closest(`[${SHEET_SKELETON}]`) === null)
		.map((element) => morphKeyOf(element));
}
