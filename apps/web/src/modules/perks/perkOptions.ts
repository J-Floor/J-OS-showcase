import {
	PERK_CATEGORIES,
	PERK_CATEGORY_LABELS,
	PERK_REQUEST_STATUSES,
	PERK_REQUEST_STATUS_LABELS,
} from "../../../convex/lib/perks.ts";

/** Every category as a picker option or enum column option, in the
 *  schema's order. */
export const PERK_CATEGORY_OPTIONS = PERK_CATEGORIES.map((category) => ({
	value: category,
	label: PERK_CATEGORY_LABELS[category],
}));

/** Every request status as an option, in the order a request moves through
 *  them. */
export const PERK_REQUEST_STATUS_OPTIONS = PERK_REQUEST_STATUSES.map(
	(status) => ({ value: status, label: PERK_REQUEST_STATUS_LABELS[status] })
);
