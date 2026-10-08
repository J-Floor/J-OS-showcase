import { Timeline, type TimelineEntry } from "@j-os/design-system";
import { useQuery } from "convex-solidjs";
import { Show, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ICONS } from "../../../shared/icons.ts";

import {
	doorActionLabel,
	doorEventLabel,
	emailLabel,
	eventLabel,
	fieldLabel,
	stateLabel,
	stepLabel,
} from "./copy.ts";

/** A field edit's before/after, without JSON quoting around plain text. */
function describeValue(value: unknown): string {
	if (value === undefined || value === null) return "empty";
	if (typeof value === "string") return value === "" ? "empty" : value;
	return JSON.stringify(value);
}

function mergedEmail(meta: unknown): string | undefined {
	if (meta && typeof meta === "object" && "droppedEmail" in meta)
		return `was ${String(meta.droppedEmail)}`;
	return undefined;
}

/**
 * Maps an audit row to a timeline entry, one `kind` label per `personEventKind`
 * so the Timeline's filter has something to group by. Field edits are the only
 * muted kind, so they are the only one collapsed by default.
 */
export function toEntry(row: {
	_id: string;
	at: number;
	kind: string;
	event?: string;
	to?: string;
	field?: string;
	before?: unknown;
	after?: unknown;
	meta?: unknown;
	actorName?: string;
	// Set only on `door_action` rows (merged in from the door log).
	action?: string;
	slot?: string;
	outcome?: string;
	detail?: string;
}): TimelineEntry {
	const base = { id: row._id, at: row.at };
	switch (row.kind) {
		case "field_edit":
			return {
				...base,
				kind: "Field edits",
				icon: ICONS.edit,
				title: `${fieldLabel(row.field)} changed`,
				detail: `${describeValue(row.before)} → ${describeValue(row.after)}`,
				actor: row.actorName,
				muted: true,
			};
		case "door":
			return {
				...base,
				kind: "Door",
				icon: ICONS.door,
				title: doorEventLabel(row.after),
				detail: typeof row.meta === "string" ? row.meta : undefined,
				actor: row.actorName,
			};
		// A door unlocked or locked from the app: same bucket as the board's
		// door overrides, so "Door" is everything about this person and the door.
		case "door_action":
			return {
				...base,
				kind: "Door",
				icon: row.action === "lock" ? ICONS.lock : ICONS.unlock,
				title: doorActionLabel(row.action, row.slot, row.outcome),
				detail: row.detail,
				actor: row.actorName,
			};
		case "board_task":
			return {
				...base,
				kind: "Board tasks",
				icon: "chat",
				title: `Board task done — ${String(row.meta)}`,
				actor: row.actorName,
			};
		case "step":
			return {
				...base,
				kind: "Onboarding steps",
				icon: ICONS.stepDone,
				title: `Completed ${stepLabel(row.meta)}`,
				actor: row.actorName,
			};
		case "email":
			return {
				...base,
				kind: "Emails",
				icon: ICONS.email,
				title: `Email sent — ${emailLabel(row.meta)}`,
			};
		case "wifi":
			return {
				...base,
				kind: "Wi-Fi",
				icon: ICONS.wifi,
				title: "Opened Wi-Fi",
				actor: row.actorName,
			};
		case "merge":
			return {
				...base,
				kind: "Transitions",
				icon: "merge",
				title: "Merged a duplicate record",
				detail: mergedEmail(row.meta),
				actor: row.actorName,
			};
		// Transitions, and any kind not worded yet: shown, never hidden.
		default:
			return {
				...base,
				kind: "Transitions",
				icon: "trending_flat",
				title: eventLabel(row.event),
				detail: stateLabel(row.to),
				actor: row.actorName,
			};
	}
}

export function PersonTimeline(props: { personId: Id<"people"> }): JSX.Element {
	const events = useQuery(
		api.personEvents.listForPerson,
		() => ({ personId: props.personId }),
		{ keepPreviousData: true }
	);
	return (
		<Show when={events.data()} fallback={<p>Loading…</p>}>
			{(rows) => <Timeline entries={rows().map(toEntry)} />}
		</Show>
	);
}
