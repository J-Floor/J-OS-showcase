import { PERK_REQUEST_STATUS_LABELS } from "../../../../convex/lib/perks.ts";
import {
	SITE_TIMEZONE,
	zonedDate,
	zonedLocalFromEpoch,
	zonedTime,
} from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";

/** Makes spreadsheets read the file as UTF-8, so accented names come
 *  through. Written as an escape: the character itself is invisible, and an
 *  editor may drop it without anyone seeing. */
const BYTE_ORDER_MARK = "\uFEFF";
const LINE_END = "\r\n";

/** First characters a spreadsheet reads as the start of a formula. Members
 *  type names, ventures and notes, so no cell may run as one. */
const FORMULA_STARTS = new Set(["=", "+", "-", "@", "\t", "\r"]);

const REQUEST_HEADER = [
	"Requested at",
	"Requester",
	"Email",
	"Venture",
	"Perk",
	"Partner",
	"Contact",
	"Status",
	"Status changed at",
	"Status changed by",
	"Note",
] as const;

/** One RFC 4180 field: always quoted, quotes doubled, line breaks kept. A
 *  value a spreadsheet would run as a formula gets a leading `'`, so it shows
 *  as text. */
export function csvCell(value: string): string {
	const text = FORMULA_STARTS.has(value.charAt(0)) ? `'${value}` : value;
	return `"${text.replaceAll('"', '""')}"`;
}

/** A whole file: the BOM, then the header and each row, every record ending
 *  in CRLF. */
export function toCsv(
	header: readonly string[],
	rows: readonly (readonly string[])[]
): string {
	const records = [header, ...rows].map((record) =>
		record.map((value) => csvCell(value)).join(",")
	);
	return `${BYTE_ORDER_MARK}${records.join(LINE_END)}${LINE_END}`;
}

/** "YYYY-MM-DD HH:mm" on the site's clock, so the file reads the same
 *  whoever downloads it and wherever they are. */
function siteDateTime(ms: number): string {
	const local = zonedLocalFromEpoch(ms, SITE_TIMEZONE);
	return `${zonedDate(local)} ${zonedTime(local)}`;
}

/** The request rows as a CSV file, in the order they are given. */
export function perkRequestsCsv(rows: PerkRequestRow[]): string {
	return toCsv(
		REQUEST_HEADER,
		rows.map((row) => [
			siteDateTime(row.requestedAt),
			row.requesterName,
			row.requesterEmail,
			row.ventureName ?? "",
			row.perkTitle,
			row.partner,
			row.contactName ?? "",
			PERK_REQUEST_STATUS_LABELS[row.status],
			siteDateTime(row.statusAt),
			row.statusByName ?? "",
			row.note ?? "",
		])
	);
}
