/**
 * Prefix/suffix detection for a control's resolved children (Button, Chip).
 *
 * Solid has no `React.Children` + `child.type === Icon`, so the children are
 * resolved to DOM nodes (`children(...).toArray()`) and each end is checked
 * against the DOM contract the adornments render: an Icon carries
 * `data-icon`, a Kbd is a `<kbd>`, a nested control (an IconButton) is a
 * `<button>`.
 *
 * The contract, one for every caller: the first visible child is a prefix
 * when it is an Icon, Kbd or button, and the last visible child (of two or
 * more) is a suffix on the same test. Each end node is checked itself, with
 * no subtree search: the one step inward is a wrapper holding exactly one
 * element (the span a disabled control sits in for its reason tooltip), so an
 * icon inside a label never counts.
 */

import { isBlank } from "./blank.ts";

const ADORNMENT = "[data-icon], kbd, button";

function isElement(node: unknown): node is Element {
	return typeof Element !== "undefined" && node instanceof Element;
}

/** The element a wrapper holds when it holds exactly one thing (the span a
 *  disabled control is wrapped in for its reason tooltip). */
function soleElementChild(element: Element): Element | undefined {
	const visible = [...element.childNodes].filter((node) => !isBlank(node));
	const [only] = visible;
	return visible.length === 1 && isElement(only) ? only : undefined;
}

function isAdornment(node: unknown): boolean {
	if (!isElement(node)) return false;
	if (node.matches(ADORNMENT)) return true;
	const inner = soleElementChild(node);
	return inner !== undefined && isAdornment(inner);
}

/** Whether the first and last visible children are adornments. A lone child
 *  is the content, so it is at most a prefix, never a suffix too. */
export function adornmentsOf(nodes: unknown[]): {
	hasPrefix: boolean;
	hasSuffix: boolean;
} {
	const visible = nodes.filter((node) => !isBlank(node));
	return {
		hasPrefix: visible.length > 0 && isAdornment(visible[0]),
		hasSuffix: visible.length > 1 && isAdornment(visible.at(-1)),
	};
}
