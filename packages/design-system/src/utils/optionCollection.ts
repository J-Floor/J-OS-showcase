/**
 * The accessors shared by the selection components (Select, Combobox), so a
 * simple list-of-items collection needs no `itemToValue` / `itemToString` of
 * its own.
 */

/** The J-OS default item shape; callers may pass richer shapes with accessors. */
export type ComboboxItem = {
	value: string;
	label?: string;
	disabled?: boolean;
};

function readTextField(item: unknown, field: string): string | undefined {
	if (typeof item !== "object" || item === null) return undefined;
	const raw = (item as Record<string, unknown>)[field];
	if (typeof raw === "string") return raw;
	if (typeof raw === "number") return String(raw);
	return undefined;
}

/**
 * The value that identifies an option: the item itself when it is a string or
 * a number, otherwise its `value` field.
 *
 * A caller with any other item shape must pass its own `itemToValue`, so
 * TypeScript never reaches the throw. It is here for a JavaScript caller, who
 * would otherwise get every option collapsed onto one value with no error.
 */
export function defaultItemToValue(item: unknown): string {
	if (typeof item === "string") return item;
	if (typeof item === "number") return String(item);

	const value = readTextField(item, "value");
	if (value === undefined) {
		throw new Error(
			"An option is identified by its `value` field. This item has none, so pass `itemToValue` to say which of its fields identifies it."
		);
	}
	return value;
}

/**
 * The text an option is displayed and searched by: the item's `label` field,
 * falling back to the value the component resolved for it.
 */
export function defaultItemToString<T>(
	item: T,
	itemToValue: (item: T) => string
): string {
	return readTextField(item, "label") ?? itemToValue(item);
}

/** Whether an option cannot be selected: the item's `disabled` field. */
export function defaultIsItemDisabled(item: unknown): boolean {
	return (
		typeof item === "object" &&
		item !== null &&
		(item as { disabled?: unknown }).disabled === true
	);
}

/** Case-insensitive substring match on each item's text. */
export function filterItemsByInput<T>(
	items: T[],
	inputValue: string,
	itemToString: (item: T) => string
): T[] {
	if (!inputValue) return items;
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive search
	const query = inputValue.toLowerCase();
	return items.filter((item) =>
		// eslint-disable-next-line no-restricted-syntax -- case-insensitive search
		itemToString(item).toLowerCase().includes(query)
	);
}
