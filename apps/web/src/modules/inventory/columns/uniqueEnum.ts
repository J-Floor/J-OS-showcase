import type { EnumOption } from "@j-os/design-system";
import { type Accessor, createMemo } from "solid-js";

export function uniqueEnum(values: readonly string[]): EnumOption[] {
	return (
		[...new Set(values)]
			.filter((value) => value !== "")
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ label: value, value }))
	);
}

function isSameOptions(
	previous: readonly EnumOption[],
	next: readonly EnumOption[]
): boolean {
	return (
		previous.length === next.length &&
		previous.every(
			(option, index) =>
				option.value === next[index].value &&
				option.label === next[index].label
		)
	);
}

/**
 * `uniqueEnum` of `values`, kept while it lists the same options: a data
 * push that changes no option leaves it (and the columns built from it) as
 * it was, so the table keeps its columns and their widths.
 */
export function createEnumOptions(
	values: Accessor<readonly string[]>
): Accessor<EnumOption[]> {
	const options = createMemo(() => uniqueEnum(values()), undefined, {
		equals: isSameOptions,
	});
	return options;
}
