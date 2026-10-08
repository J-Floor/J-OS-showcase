export type Signatory = {
	name: string;
	role: string;
	signatureSlug?: string;
};

const NOT_CONFIGURED = "BOARD_SIGNATORIES is not configured";

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

function parseSignatory(entry: unknown): Signatory {
	if (typeof entry !== "object" || entry === null)
		throw new Error(NOT_CONFIGURED);
	const { name, role, signatureSlug } = entry as Record<string, unknown>;
	if (!isNonEmptyString(name) || !isNonEmptyString(role))
		throw new Error(NOT_CONFIGURED);
	if (signatureSlug === undefined) return { name, role };
	if (!isNonEmptyString(signatureSlug)) throw new Error(NOT_CONFIGURED);
	return { name, role, signatureSlug };
}

/** Board members who countersign agreements, read from the Convex env var
 * `BOARD_SIGNATORIES` (JSON array of `{ name, role, signatureSlug? }`, in
 * stamping order). Each is stamped onto the generated PDF as a handwriting PNG
 * when `signatureSlug` resolves to a PNG uploaded with
 * `agreements:setBoardSignature`; otherwise the typed name is stamped as a
 * fallback. Role is always typed text. */
export function boardSignatories(): Signatory[] {
	const raw = process.env.BOARD_SIGNATORIES;
	if (!raw) throw new Error(NOT_CONFIGURED);
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(NOT_CONFIGURED);
	}
	if (!Array.isArray(parsed) || parsed.length === 0)
		throw new Error(NOT_CONFIGURED);
	return parsed.map(parseSignatory);
}
