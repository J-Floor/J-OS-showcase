import { describe, expect, expectTypeOf, it } from "vitest";

import type {
	HistoryEntry,
	HistoryKind,
} from "../../../convex/history/types.ts";
import { ICONS } from "../icons.ts";

import {
	ENTRY_BODY_BY_KIND,
	type EntryBodyByKind,
	toTimelineEntry,
} from "./historyEntry.ts";

function row(over: Record<string, unknown>): HistoryEntry {
	return {
		_id: "e1",
		at: 1_800_000_000_000,
		kind: "transition",
		...over,
	} as unknown as HistoryEntry;
}

function toEntry(entry: HistoryEntry): ReturnType<typeof toTimelineEntry> {
	return toTimelineEntry(entry);
}

describe("toTimelineEntry", () => {
	it("labels each audit kind with its own filter bucket", () => {
		expect(
			toEntry(row({ kind: "field_edit", field: "board.notes" })).kind
		).toBe("Field edits");
		expect(toEntry(row({ kind: "door", after: "force_off" })).kind).toBe(
			"Door"
		);
		expect(
			toEntry(row({ kind: "board_task", meta: "whatsapp" })).kind
		).toBe("Board tasks");
		expect(toEntry(row({ kind: "step", meta: "rules" })).kind).toBe(
			"Onboarding steps"
		);
		expect(toEntry(row({ kind: "email", meta: "approval" })).kind).toBe(
			"Emails"
		);
		expect(
			toEntry(row({ event: "KICK_OUT", to: "former.active" })).kind
		).toBe("Transitions");
	});

	it("mutes field edits and nothing else", () => {
		expect(toEntry(row({ kind: "field_edit", field: "x" })).muted).toBe(
			true
		);
		for (const kind of [
			"door",
			"door_action",
			"board_task",
			"step",
			"email",
			"transition",
		]) {
			expect(toEntry(row({ kind })).muted).toBeUndefined();
		}
	});

	it("renders a field edit's before and after", () => {
		const entry = toEntry(
			row({
				kind: "field_edit",
				field: "board.notes",
				before: "",
				after: "strong",
			})
		);
		expect(entry.title).toBe("board.notes changed");
		// An empty string reads as "empty", not as a pair of quote marks — the
		// timeline is prose, not a JSON dump.
		expect(entry.detail).toBe("empty → strong");
	});

	it("carries the actor through, and omits it for an email", () => {
		expect(toEntry(row({ actorName: "Bo Ard" })).actor).toBe("Bo Ard");
		// Emails have no human actor — the machine sent them.
		expect(
			toEntry(
				row({ kind: "email", meta: "approval", actorName: "Bo Ard" })
			).actor
		).toBeUndefined();
	});

	it("labels a Wi-Fi open with its own bucket", () => {
		const entry = toEntry(row({ kind: "wifi" }));
		expect(entry.kind).toBe("Wi-Fi");
		expect(entry.title).toBe("Opened Wi-Fi");
	});

	it("words a merge with the dropped email", () => {
		const entry = toEntry(
			row({ kind: "merge", meta: { droppedEmail: "old@example.com" } })
		);
		expect(entry.title).toBe("Merged a duplicate record");
		expect(entry.detail).toBe("was old@example.com");
	});

	it("files app door unlocks and locks under Door", () => {
		const unlock = toEntry(
			row({
				kind: "door_action",
				action: "unlock",
				slot: "downstairs",
				outcome: "ok",
				actorName: "Ada Lovelace",
			})
		);
		expect(unlock.kind).toBe("Door");
		expect(unlock.icon).toBe(ICONS.unlock);
		expect(unlock.title).toBe("Unlocked the Downstairs door");
		expect(unlock.detail).toBeUndefined();
		expect(unlock.actor).toBe("Ada Lovelace");

		const lock = toEntry(
			row({
				kind: "door_action",
				action: "lock",
				slot: "upstairs",
				outcome: "ok",
			})
		);
		expect(lock.kind).toBe("Door");
		expect(lock.icon).toBe(ICONS.lock);
		expect(lock.title).toBe("Locked the Upstairs door");
	});

	it("shows a failed door action as failed, with the reason", () => {
		const entry = toEntry(
			row({
				kind: "door_action",
				action: "unlock",
				slot: "upstairs",
				outcome: "failed",
				detail: "offline",
			})
		);
		expect(entry.kind).toBe("Door");
		expect(entry.title).toBe("Tried to unlock the Upstairs door — failed");
		expect(entry.detail).toBe("offline");
	});

	it("shows a busy door action as busy, not failed", () => {
		const entry = toEntry(
			row({
				kind: "door_action",
				action: "unlock",
				slot: "downstairs",
				outcome: "busy",
				detail: "still carrying out the previous command",
			})
		);
		expect(entry.title).toBe(
			"Tried to unlock the Downstairs door — the lock was still busy"
		);
	});
});

describe("perk entries", () => {
	it("words a request with the perk title and partner", () => {
		const entry = toEntry(
			row({
				kind: "perk",
				event: "requested",
				perkId: "k1",
				perkTitle: "Cloud credits",
				partner: "Acme",
				actorName: "Zoe Example",
			})
		);
		expect(entry.kind).toBe("Perks");
		expect(entry.icon).toBe(ICONS.perks);
		expect(entry.title).toBe("Requested Cloud credits");
		expect(entry.detail).toBe("Acme");
		expect(entry.actor).toBe("Zoe Example");
		expect(entry.muted).toBeUndefined();
	});

	it("leads the title with the status the request moved to", () => {
		const entry = toEntry(
			row({ kind: "perk", event: "granted", perkTitle: "Cloud credits" })
		);
		expect(entry.title).toBe("Granted Cloud credits");
	});

	it("renders without a perk link or a perk that was deleted", () => {
		const entry = toEntry(row({ kind: "perk", event: "contacted" }));
		expect(entry.title).toBe("Contacted a perk");
		expect(entry.detail).toBeUndefined();
		expect(entry.actor).toBeUndefined();
	});
});

it("words one entry of every history kind", () => {
	const titles: Record<HistoryKind, [Record<string, unknown>, string]> = {
		transition: [{ event: "KICK_OUT" }, "Kicked out"],
		field_edit: [{ field: "phone" }, "Phone changed"],
		door: [{ after: "force_on" }, "Door access forced open by the board"],
		board_task: [{ meta: "whatsapp" }, "Board task done — whatsapp"],
		step: [{ meta: "rules" }, "Completed the house rules"],
		email: [{ meta: "approval" }, "Email sent — you're in"],
		wifi: [{}, "Opened Wi-Fi"],
		merge: [{}, "Merged a duplicate record"],
		perk: [
			{ event: "declined", perkTitle: "Cloud credits" },
			"Declined Cloud credits",
		],
		door_action: [
			{ action: "lock", slot: "downstairs", outcome: "ok" },
			"Locked the Downstairs door",
		],
	};
	for (const [kind, [over, title]] of Object.entries(titles)) {
		expect(toEntry(row({ kind, ...over })).title).toBe(title);
	}
});

it("fails to compile when a kind has no builder", () => {
	const withoutPerk = {} as Omit<typeof ENTRY_BODY_BY_KIND, "perk">;
	// @ts-expect-error -- the real map minus `perk` is not an `EntryBodyByKind`
	const missing: EntryBodyByKind = withoutPerk;
	expect(missing).toBeDefined();
	expectTypeOf<
		keyof typeof ENTRY_BODY_BY_KIND
	>().toEqualTypeOf<HistoryKind>();
	expectTypeOf<HistoryKind>().toEqualTypeOf<HistoryEntry["kind"]>();
});

it("names the events that predate the statechart", () => {
	// The audit log keeps whatever was written at the time, so production
	// still holds hundreds of `SUBMIT` and `SIGN_AGREEMENT` rows from before
	// the machine existed. They were rendering as raw tokens.
	expect(toEntry(row({ at: 0, event: "SUBMIT" })).title).toBe(
		"Applied to join"
	);
	expect(toEntry(row({ at: 0, event: "SIGN_AGREEMENT" })).title).toBe(
		"Signed the agreement"
	);
});

it("shows an unrecognised event rather than hiding it", () => {
	// A name we have not written wording for is still information; swallowing
	// it would leave a gap in someone's history with no way to notice.
	expect(toEntry(row({ at: 0, event: "WAT" })).title).toBe("WAT");
});
