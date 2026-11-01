import { expect, test } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";

import { csvCell, perkRequestsCsv, toCsv } from "./toCsv.ts";

const BOM = "\uFEFF";
const HEADER =
	'"Requested at","Requester","Email","Venture","Perk","Partner","Contact","Status","Status changed at","Status changed by","Note"';

const ROW: PerkRequestRow = {
	_id: "request1" as Id<"perkRequests">,
	perkId: "perk1" as Id<"perks">,
	personId: "person1" as Id<"people">,
	requesterName: "Zoë Example",
	requesterEmail: "zoe@example.com",
	ventureName: "Acme",
	perkTitle: "Cloud credits",
	partner: "Alpha Labs",
	contactName: "Anna Board",
	// 22:30 UTC on 30 June is 00:30 on 1 July in Zurich (summer time).
	requestedAt: Date.UTC(2026, 5, 30, 22, 30),
	note: "Could we start in May?\nThanks!",
	status: "contacted",
	// 13:05 UTC on 29 October is 14:05 in Zurich: the clocks went back on the 25th.
	statusAt: Date.UTC(2026, 9, 29, 13, 5),
	statusByName: "Bea Board",
};

const BARE: PerkRequestRow = {
	_id: ROW._id,
	perkId: ROW.perkId,
	personId: ROW.personId,
	requesterName: ROW.requesterName,
	requesterEmail: ROW.requesterEmail,
	perkTitle: ROW.perkTitle,
	partner: ROW.partner,
	requestedAt: ROW.statusAt,
	status: "requested",
	statusAt: ROW.statusAt,
};

test("every cell is quoted, with its quotes doubled", () => {
	expect(csvCell("Acme")).toBe('"Acme"');
	expect(csvCell("Acme, Inc.")).toBe('"Acme, Inc."');
	expect(csvCell('The "best" deal')).toBe('"The ""best"" deal"');
	expect(csvCell("")).toBe('""');
});

test("a line break stays inside its quoted cell", () => {
	expect(csvCell("First line\nSecond line")).toBe(
		'"First line\nSecond line"'
	);
	expect(csvCell("First line\r\nSecond line")).toBe(
		'"First line\r\nSecond line"'
	);
});

test("a cell a spreadsheet would run as a formula gets a leading ' and reads as text", () => {
	expect(csvCell('=HYPERLINK("https://example.com")')).toBe(
		`"'=HYPERLINK(""https://example.com"")"`
	);
	expect(csvCell("+41 00 000 00 00")).toBe(`"'+41 00 000 00 00"`);
	expect(csvCell("-2+3")).toBe(`"'-2+3"`);
	expect(csvCell("@SUM(A1:A2)")).toBe(`"'@SUM(A1:A2)"`);
	expect(csvCell("\tindented")).toBe(`"'\tindented"`);
	expect(csvCell("\rreturn")).toBe(`"'\rreturn"`);
	// Only the first character counts.
	expect(csvCell("A = B")).toBe('"A = B"');
});

test("a file starts with a BOM and ends every record with CRLF", () => {
	expect(
		toCsv(
			["Name", "Note"],
			[
				["Ada", "Hi, there"],
				["Ben", ""],
			]
		)
	).toBe(`${BOM}"Name","Note"\r\n"Ada","Hi, there"\r\n"Ben",""\r\n`);
});

test("the request export keeps the column order and reads times on the Zurich clock", () => {
	expect(perkRequestsCsv([ROW])).toBe(
		`${BOM}${HEADER}\r\n"2026-07-01 00:30","Zoë Example","zoe@example.com","Acme","Cloud credits","Alpha Labs","Anna Board","Contacted","2026-10-29 14:05","Bea Board","Could we start in May?\nThanks!"\r\n`
	);
});

test("absent fields export as empty cells", () => {
	expect(perkRequestsCsv([BARE])).toBe(
		`${BOM}${HEADER}\r\n"2026-10-29 14:05","Zoë Example","zoe@example.com","","Cloud credits","Alpha Labs","","Requested","2026-10-29 14:05","",""\r\n`
	);
});

test("text a member typed is guarded in the export too", () => {
	expect(perkRequestsCsv([{ ...ROW, ventureName: "=1+1" }])).toContain(
		`,"'=1+1",`
	);
});

test("no rows still gives the header", () => {
	expect(perkRequestsCsv([])).toBe(`${BOM}${HEADER}\r\n`);
});
