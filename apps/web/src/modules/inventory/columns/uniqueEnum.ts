import type { EnumOption } from "@j-os/design-system";

export function uniqueEnum(values: readonly string[]): EnumOption[] {
	return (
		[...new Set(values)]
			.filter((value) => value !== "")
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ label: value, value }))
	);
}
