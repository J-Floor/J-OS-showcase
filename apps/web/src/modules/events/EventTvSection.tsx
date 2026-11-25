import { Button, DatePicker, PropertyRow, Switch } from "@j-os/design-system";
import { Show, type Accessor, type JSX } from "solid-js";

import type { Doc } from "../../../convex/_generated/dataModel";
import {
	SITE_TIMEZONE,
	composeZoned,
	formatZoned,
	zonedDate,
	zonedLocalFromEpoch,
} from "../../../convex/lib/time.ts";
import { tvCutoff } from "../../../convex/lib/tv/eventCutoff.ts";
import { NO_PICTURE_DETAIL } from "../../../convex/lib/tv/eventTvStatus.ts";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";

import type { EventPatch } from "./EventDetails.tsx";
import styles from "./EventSheet.module.scss";
import { END_OF_DAY_TIME, eventFields } from "./fields.ts";

/** What the sync last did with the event's slide, in plain words; undefined when there is nothing to say (off the TV, or not synced yet). */
function tvStatusText(
	event: Pick<Doc<"events">, "showOnTv" | "tvStatus" | "tvStatusDetail">
): string | undefined {
	if (event.showOnTv !== true) return undefined;
	switch (event.tvStatus) {
		case "shown":
			return event.tvStatusDetail === NO_PICTURE_DETAIL
				? "On the TV without its picture (the pack is nearly full)"
				: "On the TV";
		case "full":
			return `Not on the TV: ${event.tvStatusDetail ?? "the pack is full"}. Remove a slide in Space > TV.`;
		case "waiting":
			return "Waiting for the TV list to be moved";
		case undefined:
			return undefined;
	}
}

/** The "TV" section: whether the event goes on the TV slideshow, and until
 *  when. Without a chosen date the event leaves the TV by default, a few days
 *  after it ends (`tvCutoff`); that default is shown, and moves with the event. */
export function EventTvSection(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	onPatch: (patch: EventPatch) => void;
}): JSX.Element {
	function cutoffLocal(): string {
		return zonedLocalFromEpoch(tvCutoff(props.event()), SITE_TIMEZONE);
	}
	return (
		<SheetSection value="tv" title="TV">
			<PropertyRow
				label={eventFields.showOnTv.label}
				icon={eventFields.showOnTv.icon}
			>
				<Show
					when={props.isEditing()}
					fallback={
						<span>{props.event().showOnTv ? "Yes" : "No"}</span>
					}
				>
					<Switch
						label="Shown on TV"
						checked={props.event().showOnTv ?? false}
						onCheckedChange={(details) => {
							props.onPatch({ showOnTv: details.checked });
						}}
					/>
				</Show>
			</PropertyRow>
			<PropertyRow
				label={eventFields.tvUntil.label}
				icon={eventFields.tvUntil.icon}
			>
				<Show
					when={props.isEditing()}
					fallback={<span>{formatZoned(cutoffLocal())}</span>}
				>
					<div class={styles.fieldRow}>
						<DatePicker
							label={eventFields.tvUntil.label}
							labelHidden
							value={zonedDate(cutoffLocal())}
							onValueChange={(iso) => {
								if (!iso) return;
								props.onPatch({
									tvUntilLocal: composeZoned(
										iso,
										END_OF_DAY_TIME,
										SITE_TIMEZONE
									).local,
								});
							}}
						/>
						<Show when={props.event().tvUntil !== undefined}>
							<Button
								variant="secondary"
								onClick={() => {
									props.onPatch({ tvUntilLocal: null });
								}}
							>
								Use default
							</Button>
						</Show>
					</div>
				</Show>
			</PropertyRow>
			<Show when={tvStatusText(props.event())}>
				{(text) => (
					<PropertyRow
						label={eventFields.tvStatus.label}
						icon={eventFields.tvStatus.icon}
					>
						<span>{text()}</span>
					</PropertyRow>
				)}
			</Show>
		</SheetSection>
	);
}
