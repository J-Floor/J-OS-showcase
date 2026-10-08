import { displayName } from "../../../../convex/lib/names.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import { guestStatus } from "../columns/guestColumns.tsx";
import { memberGroup } from "../columns/memberColumns.tsx";

export type Rosters = {
	applications: readonly PersonRow[];
	members: readonly PersonRow[];
	guests: readonly PersonRow[];
};

export type ExportRow = {
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;
	tier: string;
	stage: string;
	formerReason?: string;
	accessFrom?: string;
	accessUntil?: string;
	submittedAt?: string;
	vertical?: string[];
	venture?: NonNullable<PersonRow["venture"]>;
	hostedBy?: string;
	score?: number;
	notes?: { author?: string; at: string; text: string }[];
};

/** Bucket rows into `{ groupKey: rows[] }`. */
function groupBy<T>(
	rows: readonly T[],
	keyFn: (row: T) => string
): Record<string, T[]> {
	const out: Record<string, T[]> = {};
	for (const row of rows) (out[keyFn(row)] ??= []).push(row);
	return out;
}

function iso(ms: number | undefined): string | undefined {
	return ms === undefined ? undefined : new Date(ms).toISOString();
}

/** Drop undefined and empty-string values, keeping key order. */
function compact(out: Record<string, unknown>): ExportRow {
	const kept = Object.entries(out).filter(
		([, v]) => v !== undefined && v !== ""
	);
	return Object.fromEntries(kept) as unknown as ExportRow;
}

/** Lightweight row: only what a reader needs, undefined/empty fields omitted. */
export function toExportRow(
	row: PersonRow,
	nameById: ReadonlyMap<string, string>
): ExportRow {
	const notes = (row.board?.noteLog ?? []).map((n) => {
		const author =
			n.authorId === undefined ? undefined : nameById.get(n.authorId);
		return {
			...(author === undefined ? {} : { author }),
			at: new Date(n.at).toISOString(),
			text: n.text,
		};
	});
	const out = {
		firstName: row.firstName,
		lastName: row.lastName,
		email: row.email,
		phone: row.phone,
		tier: row.tier,
		stage: row.stage,
		// Stale after re-admission (see derive.ts); only meaningful on formers.
		formerReason: row.tier === "former" ? row.formerReason : undefined,
		accessFrom: iso(row.accessFrom),
		accessUntil: iso(row.accessUntil),
		submittedAt: iso(row.submittedAt),
		vertical: row.vertical?.length ? row.vertical : undefined,
		venture: row.venture,
		hostedBy:
			(row.hostedById === undefined
				? undefined
				: nameById.get(row.hostedById)) ?? row.hostedBy,
		score: row.board?.score,
		notes: notes.length ? notes : undefined,
	};
	return compact(out);
}

function mapGroups<T, U>(
	rows: readonly T[],
	keyFn: (row: T) => string,
	mapRow: (row: T) => U
): Record<string, U[]> {
	return Object.fromEntries(
		Object.entries(groupBy(rows, keyFn)).map(([k, v]) => [k, v.map(mapRow)])
	);
}

function buildDoc(r: Rosters, mapRow: (row: PersonRow) => unknown): string {
	const doc = {
		applications: mapGroups(
			r.applications,
			(a) => `${a.tier}.${a.stage}`,
			mapRow
		),
		members: mapGroups(r.members, memberGroup, mapRow),
		guests: mapGroups(r.guests, guestStatus, mapRow),
	};
	return JSON.stringify(doc, null, 2);
}

/** Lightweight grouped export of all three rosters. */
export function buildLightExport(r: Rosters): string {
	const nameById = new Map(
		[...r.applications, ...r.members, ...r.guests].map((p) => [
			p._id as string,
			displayName(p),
		])
	);
	return buildDoc(r, (row) => toExportRow(row, nameById));
}

/** Raw rows as queried. */
export function buildFullExport(r: Rosters): string {
	return buildDoc(r, (row) => row);
}
