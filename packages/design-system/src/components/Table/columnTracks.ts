import type { ColumnSize } from "./types.ts";

export const SELECT_COLUMN_ID = "select";
/** A column with this id renders pinned to the trailing edge (sticky), so the
 * per-row action buttons stay visible while the other columns scroll under it.
 * It is always the last column. */
export const ACTIONS_COLUMN_ID = "actions";
export const SELECT_COLUMN_WIDTH = 48;

/** One column's grid track, the least it can be, and whether it takes a share
 *  of leftover width (`fr`). */
type ResolvedTrack = { css: string; floor: number; flexible: boolean };

/** A visible leaf column as the resolver sees it. `content` is the column's
 *  measured content width in whole px: its header and its widest cell.
 *  `contentCss`, when given, is written into the track in its place (a
 *  `var()` the table animates); the floor still counts `content`. */
type TrackColumn = {
	id: string;
	size: ColumnSize | undefined;
	content: number;
	contentCss?: string;
};

/** The table's track list (`--jf-table-tracks`) and its minimum width in px
 *  (`--jf-table-floor`). */
export type TrackLayout = {
	tracks: string;
	floor: number;
};

const FILLER_TRACK = "minmax(0, 1fr)";

/**
 * Normalise one authored pixel value. A non-finite number carries no size
 * information, so it is treated as unsized. A negative number is clamped to
 * zero: `grid-template-columns` is a single declaration, and one invalid
 * track invalidates the whole value.
 */
function clampPx(n: number): number | undefined {
	if (!Number.isFinite(n)) return undefined;
	return n < 0 ? 0 : n;
}

/** One column's authored size, given its content width, as a grid track. */
export function resolveTrack(
	size: ColumnSize | undefined,
	content: number,
	contentCss = `${String(content)}px`
): ResolvedTrack {
	if (size === undefined) {
		return {
			css: `minmax(${contentCss}, 1fr)`,
			floor: content,
			flexible: true,
		};
	}
	if (size === "content") {
		return { css: contentCss, floor: content, flexible: false };
	}
	if (typeof size === "number") {
		const fixed = clampPx(size);
		return fixed === undefined
			? resolveTrack(undefined, content, contentCss)
			: { css: `${String(fixed)}px`, floor: fixed, flexible: false };
	}

	const min =
		size.min === "content"
			? content
			: size.min === undefined
				? undefined
				: clampPx(size.min);
	const max = size.max === undefined ? undefined : clampPx(size.max);
	const weight = size.weight ?? 1;

	// A weight with neither a floor nor a ceiling may shrink below its
	// content: `minmax(0, Nfr)` takes the same share as `Nfr` without
	// refusing to go below min-content.
	if (min === undefined && max === undefined) {
		return {
			css: `minmax(0, ${String(weight)}fr)`,
			floor: 0,
			flexible: true,
		};
	}
	const floor = min ?? 0;
	const minCss = size.min === "content" ? contentCss : `${String(floor)}px`;
	// `{ min: 300, max: 100 }` is left as-is: CSS ignores a `max` below the
	// `min`, and the track resolves to the min.
	if (max !== undefined) {
		return {
			css: `minmax(${minCss}, ${String(max)}px)`,
			floor,
			flexible: false,
		};
	}
	return {
		css: `minmax(${minCss}, ${String(weight)}fr)`,
		floor,
		flexible: true,
	};
}

/** Whether a column's track depends on its measured content width. */
export function usesContent(size: ColumnSize | undefined): boolean {
	if (size === undefined || size === "content") return true;
	if (typeof size === "number") return clampPx(size) === undefined;
	return size.min === "content";
}

/**
 * The whole table's layout. When no track has an `fr` component, a
 * `minmax(0, 1fr)` filler track absorbs the slack: before the actions column,
 * or last when there is none. The floor is the sum of every track's minimum.
 */
export function resolveTrackLayout(
	columns: readonly TrackColumn[]
): TrackLayout {
	// A custom property set to "" falls `grid-template-columns` back to
	// `none`. An empty column list cannot happen in practice, but return a
	// valid track list anyway.
	if (columns.length === 0) return { tracks: "1fr", floor: 0 };
	const resolved = columns.map((column) =>
		resolveTrack(column.size, column.content, column.contentCss)
	);
	const floor = resolved.reduce((sum, track) => sum + track.floor, 0);
	const css = resolved.map((track) => track.css);
	if (resolved.some((track) => track.flexible)) {
		return { tracks: css.join(" "), floor };
	}
	const actionsIndex = columns.findIndex(
		(column) => column.id === ACTIONS_COLUMN_ID
	);
	if (actionsIndex === -1) {
		return { tracks: [...css, FILLER_TRACK].join(" "), floor };
	}
	css.splice(actionsIndex, 0, FILLER_TRACK);
	return { tracks: css.join(" "), floor };
}
