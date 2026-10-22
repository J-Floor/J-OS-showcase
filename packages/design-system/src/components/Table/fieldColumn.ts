import type { FieldDefinition } from "../../utils/fields.ts";

import type { JfColumnDefinition } from "./types.ts";

type WithoutIdentity<T> = T extends unknown ? Omit<T, "id" | "header"> : never;

/**
 * The column showing `field`: its id is the field's key and its header the
 * field's label, so its cells fly into (and out of) the sheet row or card
 * element showing the same field. Everything else is a normal column
 * definition.
 *
 * `Data` comes from where the column goes (a function returning
 * `JfColumnDefinition<Row>[]`), never from `definition` (`NoInfer`): a
 * definition's callbacks are typed by the row instead of widening it, so no
 * call site needs `fieldColumn<Row>`.
 */
export function fieldColumn<Data extends Record<string, unknown>>(
	field: FieldDefinition,
	definition: NoInfer<WithoutIdentity<JfColumnDefinition<Data>>>
): JfColumnDefinition<Data> {
	return {
		...definition,
		id: field.key,
		header: field.label,
	};
}
