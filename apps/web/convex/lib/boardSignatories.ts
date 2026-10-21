import { invariant } from "./result.ts";

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
	invariant(typeof entry === "object" && entry !== null, NOT_CONFIGURED);
	const { name, role, signatureSlug } = entry as Record<string, unknown>;
	invariant(isNonEmptyString(name) && isNonEmptyString(role), NOT_CONFIGURED);
	if (signatureSlug === undefined) return { name, role };
	invariant(isNonEmptyString(signatureSlug), NOT_CONFIGURED);
	return { name, role, signatureSlug };
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/** Board members who countersign agreements, read from the Convex env var
 * `BOARD_SIGNATORIES` (JSON array of `{ name, role, signatureSlug? }`, in
 * stamping order). Each is stamped onto the generated PDF as a handwriting PNG
 * when `signatureSlug` resolves to a PNG uploaded with
 * `agreements:setBoardSignature`; otherwise the typed name is stamped as a
 * fallback. Role is always typed text. */
export function boardSignatories(): Signatory[] {
	const raw = process.env.BOARD_SIGNATORIES;
	invariant(raw, NOT_CONFIGURED);
	const parsed = parseJson(raw);
	invariant(Array.isArray(parsed) && parsed.length > 0, NOT_CONFIGURED);
	return parsed.map((entry) => parseSignatory(entry));
}
