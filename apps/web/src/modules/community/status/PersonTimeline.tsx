import {
	EmptyState,
	Query,
	Timeline,
	type TimelineEntry,
} from "@j-os/design-system";
import type { JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useQuery } from "../../../shared/data/useQuery.ts";
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
	return meta && typeof meta === "object" && "droppedEmail" in meta
		? `was ${String(meta.droppedEmail)}`
		: undefined;
}

type AuditRow = {
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
};

type EntryBody = Omit<TimelineEntry, "id" | "at">;

/** Transitions, and any kind not worded yet: shown, never hidden. */
function transitionEntry(row: AuditRow): EntryBody {
	return {
		kind: "Transitions",
		icon: "trending_flat",
		title: eventLabel(row.event),
		detail: stateLabel(row.to),
		actor: row.actorName,
	};
}

/** One builder per `personEventKind`; a kind with none is a transition. */
const ENTRY_BODY_BY_KIND: Record<string, (row: AuditRow) => EntryBody> = {
	field_edit: (row) => ({
		kind: "Field edits",
		icon: ICONS.edit,
		title: `${fieldLabel(row.field)} changed`,
		detail: `${describeValue(row.before)} → ${describeValue(row.after)}`,
		actor: row.actorName,
		muted: true,
	}),
	door: (row) => ({
		kind: "Door",
		icon: ICONS.door,
		title: doorEventLabel(row.after),
		detail: typeof row.meta === "string" ? row.meta : undefined,
		actor: row.actorName,
	}),
	// A door unlocked or locked from the app: same bucket as the board's
	// door overrides, so "Door" is everything about this person and the door.
	door_action: (row) => ({
		kind: "Door",
		icon: row.action === "lock" ? ICONS.lock : ICONS.unlock,
		title: doorActionLabel(row.action, row.slot, row.outcome),
		detail: row.detail,
		actor: row.actorName,
	}),
	board_task: (row) => ({
		kind: "Board tasks",
		icon: "chat",
		title: `Board task done — ${String(row.meta)}`,
		actor: row.actorName,
	}),
	step: (row) => ({
		kind: "Onboarding steps",
		icon: ICONS.stepDone,
		title: `Completed ${stepLabel(row.meta)}`,
		actor: row.actorName,
	}),
	email: (row) => ({
		kind: "Emails",
		icon: ICONS.email,
		title: `Email sent — ${emailLabel(row.meta)}`,
	}),
	wifi: (row) => ({
		kind: "Wi-Fi",
		icon: ICONS.wifi,
		title: "Opened Wi-Fi",
		actor: row.actorName,
	}),
	merge: (row) => ({
		kind: "Transitions",
		icon: "merge",
		title: "Merged a duplicate record",
		detail: mergedEmail(row.meta),
		actor: row.actorName,
	}),
};

/**
 * Maps an audit row to a timeline entry, one `kind` label per `personEventKind`
 * so the Timeline's filter has something to group by. Field edits are the only
 * muted kind, so they are the only one collapsed by default.
 */
export function toEntry(row: AuditRow): TimelineEntry {
	const body = Object.hasOwn(ENTRY_BODY_BY_KIND, row.kind)
		? ENTRY_BODY_BY_KIND[row.kind](row)
		: transitionEntry(row);
	return { id: row._id, at: row.at, ...body };
}

export function PersonTimeline(props: { personId: Id<"people"> }): JSX.Element {
	const events = useQuery(
		api.personEvents.listForPerson,
		() => ({ personId: props.personId }),
		{ keepPreviousData: false }
	);
	return (
		<Query.Root data={events.data()}>
			<Query.Content of={events.data()}>
				{(rows) => (
					<Timeline entries={rows().map((row) => toEntry(row))}>
						<Timeline.Empty>
							<EmptyState title="No history yet" />
						</Timeline.Empty>
					</Timeline>
				)}
			</Query.Content>
		</Query.Root>
	);
}
