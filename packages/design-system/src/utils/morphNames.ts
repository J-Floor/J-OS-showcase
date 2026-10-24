/**
 * Every attribute and custom property the morph puts on the page, spelled
 * once. viewTransition.scss and Table.module.scss style them by the same
 * spelling; viewTransition.contract.test.ts keeps the two in step. See
 * docs/design-system/morph.md.
 */

/** The entity an element shows (`Morph`, a table row). */
export const MORPH_OF = "data-morph-of";

/**
 * Marks the title inside a morph source or target; it flies on its own. Its
 * value may be a field key (a table's title cell carries its column id): the
 * title then flies into the target's value with that key when it has one,
 * else into the target's title.
 */
export const MORPH_TITLE = "data-morph-title";

/**
 * The field an element shows, by key (a table cell: its column id; a sheet
 * value: its `FieldDefinition`'s key). A morph flies each value of its
 * source into the target's value with the same key, compared exactly. Never
 * UI copy.
 */
export const MORPH_KEY = "data-morph-key";

/** The row a pick inside an overlay closes from (Enter leaves focus in the
 *  input, so the activation alone cannot tell). */
export const MORPH_PICKED = "data-morph-picked";

/** A morph source while its overlay is open: the overlay is that element
 *  now, so viewTransition.scss hides it. */
export const MORPH_HIDDEN = "data-morph-hidden";

/**
 * An open's source, and its cells that paint their own fill, keep the look
 * they had when the morph started: Chrome drops the page's hover state as a
 * View Transition starts, so the row would lose its hover fill in the live
 * frame and in the old snapshot. The colours are value-only vars it carries
 * inline ({@link PIN_VARS}).
 */
export const MORPH_PINNED = "data-morph-pinned";

/** The colours a pinned element keeps: its background, its border. */
export const PIN_VARS = ["--jf-morph-pin-bg", "--jf-morph-pin-border"] as const;

/**
 * A container end without its own surface (fill, border, shadow, outline),
 * for the snapshot it is `jf-morph-source` in: the ghost carries that
 * surface into the morph, so the snapshot holds only the content (text,
 * icons) that fades where it is. The ghost sits exactly over it in the one
 * live frame, so nothing flashes. Covers the same cells as the pin.
 */
export const MORPH_STRIPPED = "data-morph-stripped";

/**
 * Held while a stripped element gets its surface back. Its own CSS
 * transition would otherwise fade the surface in after the ghost has gone:
 * a filled button flashed empty, then filled again.
 */
export const MORPH_SETTLING = "data-morph-settling";

/** The stand-in box a surface morph puts where its trigger is. Its geometry
 *  and surface are value-only vars it carries inline ({@link GHOST_VARS}). */
export const MORPH_GHOST = "data-morph-ghost";

/**
 * An overlay's scrim that fades with the overlay's morph (`jf-morph-scrim`),
 * set by the overlay on its backdrop. Left to its own CSS transition, the
 * scrim fades while the browser captures the page and paints nothing, so
 * the first painted frame shows it almost opaque: the whole page darkens at
 * once.
 */
export const MORPH_SCRIM = "data-morph-scrim";

/** One surface's vars under `prefix`: its fill, border and corner. */
function surfaceProperties<P extends string>(prefix: P) {
	return {
		background: `${prefix}-background`,
		borderColor: `${prefix}-border-color`,
		borderWidth: `${prefix}-border-width`,
		radius: `${prefix}-radius`,
	} as const;
}

/** The vars a surface is written to: {@link SURFACE_FROM_VARS} and the
 *  others share these keys. */
export type SurfaceProperties = ReturnType<typeof surfaceProperties>;

/** The surface a morph starts from, on `<html>` for the transition. */
export const SURFACE_FROM_VARS = surfaceProperties("--jf-morph-from");
/** The surface a morph ends on, on `<html>` for the transition. */
export const SURFACE_TO_VARS = surfaceProperties("--jf-morph-to");

/** The ghost's box on screen. */
export const GHOST_GEOMETRY_VARS = {
	top: "--jf-ghost-top",
	left: "--jf-ghost-left",
	width: "--jf-ghost-width",
	height: "--jf-ghost-height",
} as const;

/** The surface the ghost paints. */
export const GHOST_VARS = surfaceProperties("--jf-ghost");

/** The `clip-path` cutting the `jf-morph-source` snapshot to what of its
 *  element was on screen, on `<html>` for the transition. */
export const SOURCE_CLIP_VAR = "--jf-morph-source-clip";
