// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import type { PersonRow } from "../../../../convex/people.ts";

import {
	buildFullExport,
	buildLightExport,
	toExportRow,
} from "./exportShape.ts";

let seq = 0;
function person(over: Record<string, unknown> = {}): PersonRow {
	seq += 1;
	return {
		_id: `p${seq}`,
		_creationTime: 1,
		firstName: "Ada",
		lastName: "Lovelace",
		email: `ada${seq}@example.com`,
		tier: "member",
		stage: "active",
		status: "active",
		hasAgreement: true,
		...over,
	} as unknown as PersonRow;
}

const noNames = new Map<string, string>();

describe("toExportRow", () => {
	it("keeps only the light fields, in order", () => {
		const row = person({
			phone: "123",
			tier: "former",
			formerReason: "left",
			accessFrom: 1,
			accessUntil: 2,
			submittedAt: 3,
			vertical: ["ai"],
			venture: { name: "Acme" },
			hostedBy: "Legacy",
			board: { score: 4, noteLog: [{ at: 5, text: "hi" }] },
			lastPath: "/x",
			door: {},
			onboarding: {},
			provenance: {},
		});
		expect(Object.keys(toExportRow(row, noNames))).toEqual([
			"firstName",
			"lastName",
			"email",
			"phone",
			"tier",
			"stage",
			"formerReason",
			"accessFrom",
			"accessUntil",
			"submittedAt",
			"vertical",
			"venture",
			"hostedBy",
			"score",
			"notes",
		]);
	});

	it("converts timestamps to ISO strings", () => {
		const out = toExportRow(
			person({ accessUntil: Date.UTC(2026, 0, 2) }),
			noNames
		);
		expect(out.accessUntil).toBe("2026-01-02T00:00:00.000Z");
	});

	it("resolves hostedById, falls back to legacy hostedBy, else omits", () => {
		const names = new Map([["h1", "Grace Hopper"]]);
		expect(
			toExportRow(person({ hostedById: "h1", hostedBy: "Old" }), names)
				.hostedBy
		).toBe("Grace Hopper");
		expect(
			toExportRow(person({ hostedById: "gone", hostedBy: "Old" }), names)
				.hostedBy
		).toBe("Old");
		expect("hostedBy" in toExportRow(person(), names)).toBe(false);
	});

	it("maps noteLog to notes with resolved authors", () => {
		const names = new Map([["h1", "Grace Hopper"]]);
		const out = toExportRow(
			person({
				board: {
					noteLog: [
						{ authorId: "h1", at: 0, text: "a" },
						{ at: 0, text: "b" },
					],
				},
			}),
			names
		);
		expect(out.notes).toEqual([
			{
				author: "Grace Hopper",
				at: "1970-01-01T00:00:00.000Z",
				text: "a",
			},
			{ at: "1970-01-01T00:00:00.000Z", text: "b" },
		]);
		expect("author" in (out.notes as object[])[1]).toBe(false);
	});

	it("omits empty-string fields", () => {
		const out = toExportRow(
			person({ phone: "", formerReason: "", hostedBy: "" }),
			noNames
		);
		expect("phone" in out).toBe(false);
		expect("formerReason" in out).toBe(false);
		expect("hostedBy" in out).toBe(false);
	});

	it("drops a stale formerReason once the person is no longer former", () => {
		const out = toExportRow(
			person({ tier: "member", formerReason: "kicked" }),
			noNames
		);
		expect("formerReason" in out).toBe(false);
	});

	it("omits empty vertical and empty noteLog", () => {
		const out = toExportRow(
			person({ vertical: [], board: { noteLog: [] } }),
			noNames
		);
		expect("vertical" in out).toBe(false);
		expect("notes" in out).toBe(false);
	});
});

describe("buildLightExport", () => {
	it("groups each roster and resolves hosts across rosters", () => {
		const host = person({ firstName: "Grace", lastName: "Hopper" });
		const app = person({ tier: "prospect", stage: "queued" });
		const guest = person({
			tier: "guest",
			stage: "expired",
			hostedById: host._id,
		});
		const doc = JSON.parse(
			buildLightExport({
				applications: [app],
				members: [host],
				guests: [guest],
			})
		) as Record<string, Record<string, { hostedBy?: string }[]>>;
		expect(doc.applications["prospect.queued"]).toHaveLength(1);
		expect(doc.guests.expired[0].hostedBy).toBe("Grace Hopper");
	});
});

describe("buildFullExport", () => {
	it("keeps the raw rows as queried", () => {
		const row = person({ hostedBy: "Grace" });
		const json = buildFullExport({
			applications: [],
			members: [row],
			guests: [],
		});
		expect(json).toContain('"status"');
		expect(json).toContain('"hostedBy": "Grace"');
		expect(json).toContain(row._id);
	});
});
