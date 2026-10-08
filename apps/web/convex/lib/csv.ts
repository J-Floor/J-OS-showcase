// Shared parser for the comma-separated env vars that pack a list into one
// string (the door provider's lock ids, `DOOR_BUILDING_IP`).

/** Split a comma-separated env var into trimmed, non-empty entries. */
export function parseCsv(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}
