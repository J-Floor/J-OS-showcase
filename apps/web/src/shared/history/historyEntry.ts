import type { TimelineEntry } from "@j-os/design-system";

import type {
	DoorActionEntry,
	HistoryEntry,
	HistoryKind,
	PerkEntry,
	PersonEventEntry,
} from "../../../convex/history/types.ts";
import { PERK_REQUEST_STATUS_LABELS } from "../../../convex/lib/perks.ts";
import {
	emailLabel,
	eventLabel,
	fieldLabel,
	stateLabel,
	stepLabel,
} from "../../modules/community/status/copy.ts";
import { ICONS } from "../icons.ts";

import { doorActionLabel, doorEventLabel } from "./doorWording.ts";

/** What a history entry adds to a timeline row; `toTimelineEntry` supplies
 *  the id and time. */
export type EntryBody = Omit<TimelineEntry, "id" | "at">;

/** The entry of one kind. Written out, not `Extract`ed: the `personEvents`
 *  members share one row type whose `kind` is the whole union. */
export type EntryOf<Kind extends HistoryKind> = Kind extends "perk"
	? PerkEntry
	: Kind extends "door_action"
		? DoorActionEntry
		: PersonEventEntry & { kind: Kind };

/** A field edit's before/after, without JSON quoting around plain text. */
function describeValue(value: unknown): string {
	if (value === undefined || value === null) return "empty";
	if (typeof value === "string") return value === "" ? "empty" : value;
	return JSON.stringify(value);
}

function mergedEmail(meta: unknown): string | undefined {
	return meta && typeof meta === "object" && "droppedEmail" in meta
		? `was ${String(meta.droppedEmail)}`
		: undefined;
}

/** What a perk entry calls the perk once it has been deleted. */
const DELETED_PERK = "a perk";

/**
 * One builder per history kind. Typed over every `HistoryKind`, so a new kind
 * fails to compile until it has a renderer; there is no fallback.
 */
export type EntryBodyByKind = {
	[Kind in HistoryKind]: (entry: EntryOf<Kind>) => EntryBody;
};

export const ENTRY_BODY_BY_KIND: EntryBodyByKind = {
	transition: (entry) => ({
		kind: "Transitions",
		icon: "trending_flat",
		title: eventLabel(entry.event),
		detail: stateLabel(entry.to),
		actor: entry.actorName,
	}),
	field_edit: (entry) => ({
		kind: "Field edits",
		icon: ICONS.edit,
		title: `${fieldLabel(entry.field)} changed`,
		detail: `${describeValue(entry.before)} → ${describeValue(entry.after)}`,
		actor: entry.actorName,
		muted: true,
	}),
	door: (entry) => ({
		kind: "Door",
		icon: ICONS.door,
		title: doorEventLabel(entry.after),
		detail: typeof entry.meta === "string" ? entry.meta : undefined,
		actor: entry.actorName,
	}),
	board_task: (entry) => ({
		kind: "Board tasks",
		icon: "chat",
		title: `Board task done — ${String(entry.meta)}`,
		actor: entry.actorName,
	}),
	step: (entry) => ({
		kind: "Onboarding steps",
		icon: ICONS.stepDone,
		title: `Completed ${stepLabel(entry.meta)}`,
		actor: entry.actorName,
	}),
	email: (entry) => ({
		kind: "Emails",
		icon: ICONS.email,
		title: `Email sent — ${emailLabel(entry.meta)}`,
	}),
	wifi: (entry) => ({
		kind: "Wi-Fi",
		icon: ICONS.wifi,
		title: "Opened Wi-Fi",
		actor: entry.actorName,
	}),
	merge: (entry) => ({
		kind: "Transitions",
		icon: "merge",
		title: "Merged a duplicate record",
		detail: mergedEmail(entry.meta),
		actor: entry.actorName,
	}),
	perk: (entry) => ({
		kind: "Perks",
		icon: ICONS.perks,
		title: `${PERK_REQUEST_STATUS_LABELS[entry.event]} ${entry.perkTitle ?? DELETED_PERK}`,
		detail: entry.partner,
		actor: entry.actorName,
	}),
	// Same bucket as the board's door overrides, so "Door" is everything about
	// this person and the door.
	door_action: (entry) => ({
		kind: "Door",
		icon: entry.action === "lock" ? ICONS.lock : ICONS.unlock,
		title: doorActionLabel(entry.action, entry.slot, entry.outcome),
		detail: entry.detail,
		actor: entry.actorName,
	}),
};

/**
 * Maps a history entry to a timeline entry, one `kind` label per bucket so the
 * Timeline's filter has something to group by. Field edits are the only muted
 * kind, so they are the only one collapsed by default.
 */
export function toTimelineEntry(entry: HistoryEntry): TimelineEntry {
	// TypeScript cannot correlate the entry's kind with its builder through
	// the union, so the one lookup is widened here.
	const build = ENTRY_BODY_BY_KIND[entry.kind] as (
		entry: HistoryEntry
	) => EntryBody;
	return { id: entry._id, at: entry.at, ...build(entry) };
}
