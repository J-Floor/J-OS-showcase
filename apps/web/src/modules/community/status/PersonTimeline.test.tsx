// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

// Property 4 (timeline renders events / gives a sensible empty state) needs
// `PersonTimeline` itself mounted, which calls `useQuery` — stub it out (as
// CountdownCard.test.tsx and MembersTab.test.tsx already do) so it renders
// without a ConvexProvider, with data supplied per test through a shared ref.
// Declared before the import below so `vi.mock`'s hoist lands above it.
const { queryDataRef } = vi.hoisted(() => ({
	queryDataRef: { current: undefined as unknown[] | undefined },
}));

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => queryDataRef.current,
		isLoading: () => false,
		error: () => undefined,
	}),
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import { ICONS } from "../../../shared/icons.ts";

import { PersonTimeline, toEntry } from "./PersonTimeline.tsx";

function row(over: Record<string, unknown>) {
	return { _id: "e1", at: 1_800_000_000_000, kind: "transition", ...over };
}

describe("toEntry", () => {
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

	it("falls through to a transition for an unrecognised kind", () => {
		const entry = toEntry(
			row({ kind: "something_new", event: "DENY", to: "prospect.denied" })
		);
		expect(entry.kind).toBe("Transitions");
		expect(entry.title).toBe("Application turned down");
		// The state the transition landed in, worded rather than dumped — and
		// worded the way the board says it: the machine's tier is `prospect`,
		// the tab and the drawer both call them applicants.
		expect(entry.detail).toBe("Now applicant, denied");
	});
});

describe("PersonTimeline", () => {
	afterEach(() => {
		cleanup();
		queryDataRef.current = undefined;
	});

	it("renders the person's events", () => {
		queryDataRef.current = [
			row({ kind: "door", after: "force_off", actorName: "Sara" }),
		];
		render(() => <PersonTimeline personId={"p1" as Id<"people">} />);
		expect(
			screen.getByText("Door access blocked by the board")
		).toBeInTheDocument();
	});

	it("shows something sensible, not an empty box, for a person with no events", () => {
		queryDataRef.current = [];
		render(() => <PersonTimeline personId={"p1" as Id<"people">} />);
		expect(screen.getByText("No history yet.")).toBeInTheDocument();
	});
});

it("names the events that predate the statechart", () => {
	// The audit log keeps whatever was written at the time, so production
	// still holds hundreds of `SUBMIT` and `SIGN_AGREEMENT` rows from before
	// the machine existed. They were rendering as raw tokens.
	expect(
		toEntry({ _id: "e", at: 0, kind: "transition", event: "SUBMIT" }).title
	).toBe("Applied to join");
	expect(
		toEntry({
			_id: "e",
			at: 0,
			kind: "transition",
			event: "SIGN_AGREEMENT",
		}).title
	).toBe("Signed the agreement");
});

it("shows an unrecognised event rather than hiding it", () => {
	// A name we have not written wording for is still information; swallowing
	// it would leave a gap in someone's history with no way to notice.
	expect(
		toEntry({ _id: "e", at: 0, kind: "transition", event: "WAT" }).title
	).toBe("WAT");
});
