import type { EnumOption } from "@j-os/design-system";

export function uniqueEnum(values: readonly string[]): EnumOption[] {
	return [...new Set(values)]
		.filter((v) => v !== "")
		.sort((a, b) => a.localeCompare(b))
		.map((value) => ({ label: value, value }));
}
