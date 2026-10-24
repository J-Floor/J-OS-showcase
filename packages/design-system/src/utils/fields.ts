import { MORPH_KEY } from "./morphPairing.ts";

/**
 * One field of an entity, defined once and used by every place that shows
 * it: its table column ({@link fieldColumn}), its sheet row (`PropertyRow
 * field`) and any other element showing it ({@link morphPart}). The key is
 * what a morph pairs on, so a column and a sheet row showing the same field
 * cannot drift apart: a typo is a type error, never a silent no-flight.
 */
export type FieldDefinition<Key extends string = string> = {
	readonly key: Key;
	readonly label: string;
	readonly icon?: string;
};

type FieldSpec = Omit<FieldDefinition, "key">;

type Fields<Specs extends Record<string, FieldSpec>> = {
	readonly [Key in keyof Specs & string]: FieldDefinition<Key> & Specs[Key];
};

/** An entity's fields, each keyed by its own name. */
export function defineFields<const Specs extends Record<string, FieldSpec>>(
	specs: Specs
): Fields<Specs> {
	return Object.fromEntries(
		Object.entries(specs).map(([key, spec]) => [key, { ...spec, key }])
	) as Fields<Specs>;
}

/**
 * Spread on an element that shows `field` outside a `PropertyRow` (a card's
 * due date, a title's first-name half, a list of links): a morph flies it
 * into, or out of, the other end's element showing the same field. Without
 * a field (an optional prop) it marks nothing.
 */
export function morphPart(field?: FieldDefinition): {
	[MORPH_KEY]?: string;
} {
	return field ? { [MORPH_KEY]: field.key } : {};
}
