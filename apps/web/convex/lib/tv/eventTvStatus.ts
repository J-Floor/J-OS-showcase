import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

// Where an event's TV slide stands, kept on the event so the sheet can say it
// (the sync and the commit set it; an event off the TV has none).

export type TvStatus = NonNullable<Doc<"events">["tvStatus"]>;

/** `tvStatusDetail` of a shown event whose picture did not fit (its slide shows the wordmark panel). */
export const NO_PICTURE_DETAIL = "noPicture";

/** Records the event's TV status (`undefined`: off the TV). Writes only a change, so the sheet's live query does not wake for nothing. `eventId` may be any string a config named; one that is no event is ignored. */
export async function setTvStatus(
	context: MutationCtx,
	eventId: string,
	status: TvStatus | undefined,
	detail?: string
): Promise<void> {
	const id = context.db.normalizeId("events", eventId);
	if (id === null) return;
	const event = await context.db.get(id);
	if (event === null) return;
	if (event.tvStatus === status && event.tvStatusDetail === detail) return;
	await context.db.patch(id, {
		tvStatus: status,
		tvStatusDetail: detail,
	});
}
