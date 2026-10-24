/** A resolved child that puts nothing on screen: a hidden part (`null`,
 *  `undefined`, a boolean), a blank string, or a blank text node (the empty
 *  marker a portal leaves where it sits). */
export function isBlank(node: unknown): boolean {
	return (
		node === null ||
		node === undefined ||
		typeof node === "boolean" ||
		textOf(node)?.trim() === ""
	);
}

function textOf(node: unknown): string | undefined {
	if (typeof node === "string") return node;
	return typeof Text !== "undefined" && node instanceof Text
		? node.data
		: undefined;
}
