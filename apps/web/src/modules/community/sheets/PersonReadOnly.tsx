import { morphPart, PropertyRow, Skeleton } from "@j-os/design-system";
import { For, Show } from "solid-js";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { formatDate } from "../../../shared/time.ts";
import { personFields } from "../fields.ts";
import { hostDisplay } from "../hostDisplay.ts";
import { attendedEventsQuery } from "../queries.ts";
import { VentureLink } from "../VentureLink.tsx";

import {
	fundingStageLabel,
	productStageLabel,
	verticalsLabel,
} from "./labels.ts";
import styles from "./PersonDetail.module.scss";

/** Resolves a person's host to a display name: the referenced board member's
 * name via `hostedById`, falling back to the legacy `hostedBy` string. */
function HostName(props: { person: Doc<"people"> }) {
	const boardLevel = useBoardLevel();
	function host() {
		return hostDisplay(boardLevel.data(), props.person);
	}
	return (
		<Show when={!host().loading} fallback={<Skeleton width="medium" />}>
			<span>{host().name ?? "—"}</span>
		</Show>
	);
}

/** The original read-only field list, shown when not editing. */
export function ReadOnlyDetail(props: { person: Doc<"people"> }) {
	function person() {
		return props.person;
	}
	return (
		<div>
			<BoardDetail person={person()} />
			<PropertyRow field={personFields.email}>
				<span>{person().email}</span>
			</PropertyRow>
			<Show when={person().phone}>
				<PropertyRow field={personFields.phone}>
					<span>{person().phone}</span>
				</PropertyRow>
			</Show>
			{/* Access has moved to the Status section, as "Access until" and
			    only for the people who have an end date — it is a fact about
			    their standing, not a profile field, and it read as a permanent
			    "—" on everyone who never expires. */}
			<PropertyRow field={personFields.ventureName}>
				<span>{person().venture?.name ?? "—"}</span>
			</PropertyRow>
			<Show when={person().hostedById ?? person().hostedBy}>
				<PropertyRow field={personFields.hostedById}>
					<HostName person={person()} />
				</PropertyRow>
			</Show>
			<PropertyRow icon={ICONS.vertical} label="Verticals">
				<span {...morphPart(personFields.vertical)}>
					{verticalsLabel(person().vertical) || "—"}
				</span>
			</PropertyRow>
			<AttendedEvents personId={person()._id} />
			<VentureDetail person={person()} />
		</div>
	);
}

/**
 * The event(s) that brought this person in, e.g. a hackathon visitor who later
 * applied — the visitor flow's own origin story. Read-only: derived from
 * attendance rows, not something edited here. Renders nothing for the common
 * case of someone who never attended an event.
 */
function AttendedEvents(props: { personId: Id<"people"> }) {
	const events = useQuery(
		attendedEventsQuery.query,
		() => attendedEventsQuery.args(props.personId),
		{ keepPreviousData: false }
	);
	function names(): string {
		return (events.data() ?? [])
			.map((attended) => attended.name)
			.join(", ");
	}
	return (
		<Show when={events.data() === undefined || names()}>
			<PropertyRow icon={ICONS.events} label="Came from">
				<Show
					when={events.data() !== undefined}
					fallback={<Skeleton width="medium" />}
				>
					<span>{names()}</span>
				</Show>
			</PropertyRow>
		</Show>
	);
}

/**
 * What the board recorded about this person: the score they were given and any
 * notes, plus when they applied.
 *
 * Only shown where there is something to show. A board member has no score and
 * no submission date; an applicant has both. This is the other half of the old
 * `ApplicationDetail`, which existed only because applications used to be a
 * separate table — the moment someone was approved, their score and the board's
 * own notes became unreachable.
 */
function BoardDetail(props: { person: Doc<"people"> }) {
	function person() {
		return props.person;
	}
	return (
		<>
			<Show when={typeof person().board?.score === "number"}>
				<PropertyRow icon="star" label="Score">
					<span>{String(person().board?.score)}</span>
				</PropertyRow>
			</Show>
			<Show when={person().submittedAt}>
				{(at) => (
					<PropertyRow icon={ICONS.date} label="Applied">
						<span {...morphPart(personFields.createdAt)}>
							{formatDate(at())}
						</span>
					</PropertyRow>
				)}
			</Show>
		</>
	);
}

/**
 * What they told us when they applied: what they are building, what they have
 * built before, why they want in.
 *
 * This lived only in the Applications sheet, which meant the moment someone
 * was approved the board could no longer see why they had approved them —
 * their own notes and the founder's own words disappeared behind the tab
 * change. The fields are on the person now, so the sheet shows them for the
 * whole lifecycle. Every row is conditional: a board member has none of this
 * and should not see nine empty labels.
 */
function VentureDetail(props: { person: Doc<"people"> }) {
	return (
		<>
			<VentureStory person={props.person} />
			<VentureProgress person={props.person} />
			<VentureReach person={props.person} />
		</>
	);
}

/** What they are building, what they have built before, and why they want in. */
function VentureStory(props: { person: Doc<"people"> }) {
	function venture() {
		return props.person.venture;
	}
	return (
		<>
			<Show when={venture()?.description}>
				<PropertyRow field={personFields.description}>
					<span class={styles.multiline}>
						{venture()?.description}
					</span>
				</PropertyRow>
			</Show>
			<Show when={venture()?.pastBuilt}>
				<PropertyRow field={personFields.pastBuilt}>
					<span class={styles.multiline}>{venture()?.pastBuilt}</span>
				</PropertyRow>
			</Show>
			<Show when={venture()?.whyJoin}>
				<PropertyRow field={personFields.whyJoin}>
					<span class={styles.multiline}>{venture()?.whyJoin}</span>
				</PropertyRow>
			</Show>
		</>
	);
}

/** How far along the venture is: product stage, funding stage, team size. */
function VentureProgress(props: { person: Doc<"people"> }) {
	function venture() {
		return props.person.venture;
	}
	return (
		<>
			<Show when={venture()?.productStage}>
				<PropertyRow field={personFields.productStage}>
					<span>{productStageLabel(venture()?.productStage)}</span>
				</PropertyRow>
			</Show>
			<Show when={venture()?.fundingStage}>
				<PropertyRow field={personFields.fundingStage}>
					<span>{fundingStageLabel(venture()?.fundingStage)}</span>
				</PropertyRow>
			</Show>
			<Show when={typeof venture()?.teamSize === "number"}>
				<PropertyRow field={personFields.teamSize}>
					<span>{String(venture()?.teamSize)}</span>
				</PropertyRow>
			</Show>
		</>
	);
}

/** Where to find them: their links, and who referred them. */
function VentureReach(props: { person: Doc<"people"> }) {
	function venture() {
		return props.person.venture;
	}
	return (
		<>
			<Show when={(venture()?.links ?? []).length > 0}>
				<PropertyRow field={personFields.links}>
					<span class={styles.links}>
						<For each={venture()?.links}>
							{(link) => <VentureLink link={link} />}
						</For>
					</span>
				</PropertyRow>
			</Show>
			<Show when={venture()?.referral}>
				<PropertyRow field={personFields.referral}>
					<span>{venture()?.referral}</span>
				</PropertyRow>
			</Show>
		</>
	);
}
