import {
	Morph,
	PropertyRow,
	createHoverIntent,
	defineFields,
} from "@j-os/design-system";
import { Show, type Accessor, type JSX } from "solid-js";

import { SITE_TIMEZONE } from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { PersonListItem } from "../../../shared/components/PersonListItem.tsx";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { warmPeek } from "../../../shared/entity/lazyPeek.tsx";
import { useOpenPeek } from "../../../shared/entity/openEntity.ts";
import { SheetSection } from "../../../shared/entity/SheetSection.tsx";
import { HistoryTimeline } from "../../../shared/history/HistoryTimeline.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { formatDateIn } from "../../../shared/time.ts";
import { personEntity } from "../../community/entity.ts";
import { perksEntity } from "../entity.ts";
import { perkFields } from "../fields.ts";

import { perkRequestHistoryQuery } from "./requestQueries.ts";
import styles from "./RequestSheet.module.scss";

/** A request's fields, as its sheet lists them. */
export const requestFields = defineFields({
	requester: { label: "Requester", icon: ICONS.person },
	// The perk's title field under the key the Requests tab's Perk column
	// has: spread whole, its own `title` key would clash with this one.
	perk: { label: perkFields.title.label, icon: perkFields.title.icon },
	venture: { label: "Venture", icon: ICONS.venture },
	contact: perkFields.contact,
	requestedAt: { label: "Requested on", icon: ICONS.date },
	note: { label: "Note", icon: ICONS.description },
});

/** The perk as the Requests tab names it, opening its own peek: the perk's
 *  sheet morphs out of this row and back into it. The peek loads once the
 *  pointer rests on it and on the press, as `PersonListItem`'s `warm` does:
 *  without it, a first open has nothing to morph into. */
function PerkLink(props: { request: Accessor<PerkRequestRow> }): JSX.Element {
	const openPeek = useOpenPeek();
	const hoverIntent = createHoverIntent(() => {
		warmPeek(perksEntity);
	});
	return (
		<Morph
			morphId={props.request().perkId}
			asChild={(morph) => (
				<button
					{...morph()}
					type="button"
					class={styles.link}
					onPointerEnter={hoverIntent.onPointerEnter}
					onPointerLeave={hoverIntent.onPointerLeave}
					onPointerDown={() => {
						warmPeek(perksEntity);
					}}
					onClick={() => {
						openPeek(perksEntity, props.request().perkId);
					}}
				>
					{props.request().partner} · {props.request().perkTitle}
				</button>
			)}
		/>
	);
}

/** Who asked and for what, from where, and what they wrote. The requester
 *  and the perk each open their own peek. */
export function RequestDetailsSection(props: {
	request: Accessor<PerkRequestRow>;
}): JSX.Element {
	const openPeek = useOpenPeek();
	return (
		<SheetSection value="details" title="Details">
			<PropertyRow field={requestFields.requester}>
				<PersonListItem
					name={props.request().requesterName}
					detail={props.request().requesterEmail}
					open={() => {
						openPeek(personEntity, props.request().personId);
					}}
					warm={() => {
						warmPeek(personEntity);
					}}
					morphOf={props.request().personId}
				/>
			</PropertyRow>
			{/* Not keyed as the perk: the line under the sheet's title is,
			    and one end has one value per key. */}
			<PropertyRow
				label={requestFields.perk.label}
				icon={requestFields.perk.icon}
			>
				<PerkLink request={props.request} />
			</PropertyRow>
			<PropertyRow field={requestFields.venture}>
				<span>{props.request().ventureName ?? "No venture"}</span>
			</PropertyRow>
			<PropertyRow field={requestFields.contact}>
				<span>{props.request().contactName ?? "No contact"}</span>
			</PropertyRow>
			<PropertyRow field={requestFields.requestedAt}>
				<span>
					{formatDateIn(props.request().requestedAt, SITE_TIMEZONE)}
				</span>
			</PropertyRow>
			<Show when={props.request().note}>
				{(note) => (
					<PropertyRow field={requestFields.note}>
						<p class={styles.note}>{note()}</p>
					</PropertyRow>
				)}
			</Show>
		</SheetSection>
	);
}

/** The request's own history, newest first: made, then each move the
 *  board made, and by whom. */
export function RequestHistorySection(props: {
	request: Accessor<PerkRequestRow>;
}): JSX.Element {
	const history = useQuery(
		perkRequestHistoryQuery.query,
		() => perkRequestHistoryQuery.args(props.request()._id),
		{ keepPreviousData: false }
	);
	return (
		<SheetSection value="history" title="History">
			<HistoryTimeline entries={history.data()} />
		</SheetSection>
	);
}
