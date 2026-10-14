/** Whether `value` (a `?tab=` param, say) is one of `keys`. */
export function isTabKey<Key extends string>(
	keys: readonly Key[],
	value: unknown
): value is Key {
	return (
		typeof value === "string" && (keys as readonly string[]).includes(value)
	);
}

/** `value` when it is one of `keys`, otherwise `fallback`. */
export function tabKeyOf<Key extends string>(
	keys: readonly Key[],
	value: unknown,
	fallback: Key
): Key {
	return isTabKey(keys, value) ? value : fallback;
}
