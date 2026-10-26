import type { EntityRow } from "../types.ts";

import type { EntityDescriptor } from "./entityDescriptor.ts";

/** The search param a peek lives in, on whatever page is open. */
export const PEEK_PARAM = "open";
const SEPARATOR = ":";

export function peekValue<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	slug: string
): string {
	return `${desc.key}${SEPARATOR}${slug}`;
}

export function parsePeek(
	value: unknown
): { kind: string; slug: string } | undefined {
	const at = typeof value === "string" ? value.indexOf(SEPARATOR) : -1;
	return typeof value === "string" && at > 0 && at < value.length - 1
		? { kind: value.slice(0, at), slug: value.slice(at + 1) }
		: undefined;
}
