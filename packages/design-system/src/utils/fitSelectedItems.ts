/**
 * Fits the current selection of a Select or Combobox on the control's single
 * line. Shared by both, and internal to them rather than part of the package's
 * public API, so it is not re-exported from the `@utils` barrel.
 */

/** What `fitSelectedItems` resolved for one measurement pass. */
export type FitSelectedItemsResult = {
	/**
	 * How many of the trailing items are rendered. The items that do not fit
	 * are the earlier ones, which collapse into the overflow badge.
	 */
	visibleCount: number;
};

/**
 * Decides how many selected items fit on one line, keeping the most recent
 * ones.
 *
 * `chipWidths` is in selection order, so index 0 is the earliest selection and
 * the last index the most recent. The result counts from the end: a
 * `visibleCount` of 2 renders the last two items and collapses the rest into
 * the overflow badge.
 *
 * Every width is a used width, so the caller folds the row's gap into each of
 * them and into `containerWidth`: pass `width + gap` per item, `badge + gap`,
 * and `container + gap`. The trailing gap the last item does not have then
 * cancels out exactly.
 *
 * The badge only takes room while something is hidden, so the whole row is
 * measured against the bare container width first. Reserving the badge inside
 * the loop instead would hide an item to make space for a badge that the full
 * row never needed.
 *
 * At least one item is always rendered. A single item wider than the control
 * is left to truncate rather than disappear.
 */
export function fitSelectedItems(
	chipWidths: number[],
	containerWidth: number,
	badgeWidth: number
): FitSelectedItemsResult {
	if (chipWidths.length === 0) return { visibleCount: 0 };

	const total = chipWidths.reduce((sum, width) => sum + width, 0);
	if (total <= containerWidth) {
		return { visibleCount: chipWidths.length };
	}

	// Something is hidden from here on, so the badge is always on the row.
	let used = badgeWidth;
	let visibleCount = 0;

	for (let index = chipWidths.length - 1; index >= 0; index--) {
		if (used + chipWidths[index] > containerWidth) break;

		used += chipWidths[index];
		visibleCount++;
	}

	return { visibleCount: Math.max(1, visibleCount) };
}
