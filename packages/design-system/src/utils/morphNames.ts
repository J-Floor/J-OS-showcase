/**
 * Every attribute and custom property the morph puts on the page, spelled
 * once. viewTransition.scss, Table.module.scss and _hover.scss style them by
 * the same spelling; viewTransition.contract.test.ts and
 * hover.contract.test.ts keep them in step. See docs/design-system/morph.md.
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

/**
 * An overlay's content while it is shown, set by the overlay layer. A morph
 * names every one under the overlay it opens or closes: each steps back or
 * forward in the update, and the browser animates it as its own group.
 */
export const MORPH_LAYER = "data-morph-layer";

/** A morph source while its overlay is open: the overlay is that element
 *  now, so viewTransition.scss hides it. */
export const MORPH_HIDDEN = "data-morph-hidden";

/**
 * Each element of an open's source the pointer holds, for the length of the
 * morph: Chrome drops the page's hover state as a View Transition starts, so
 * the hovered row would lose its hover look in the live frame and in the old
 * snapshot. A component's hover rule matches {@link MORPH_PINNED_SELECTOR}
 * as it matches `:hover` (the `hover` mixin writes both), so the look holds.
 */
export const MORPH_PINNED = "data-morph-pinned";

/** The value {@link MORPH_PINNED} takes on a held element. */
export const MORPH_PINNED_HELD = "held";

/** The selector a hover rule matches beside `:hover`: a held element of a
 *  morph's source. */
export const MORPH_PINNED_SELECTOR = `[${MORPH_PINNED}="${MORPH_PINNED_HELD}"]`;

/**
 * The stand-in box a surface morph puts over its trigger, named in the
 * snapshot the trigger is not: it gives the morph the trigger's box, nothing
 * else. It paints nothing: its snapshot is never shown (the surface is drawn
 * from `--jf-morph-from-*`/`--jf-morph-to-*`), and on open it sits in the
 * frame the browser freezes on screen while the update renders, which must
 * show the page exactly as it was. Its geometry is value-only vars it
 * carries inline ({@link GHOST_GEOMETRY_VARS}).
 */
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

/**
 * The class of a box flight: a keyed value pair one of whose ends paints a
 * field box (morph.ts). Its group grows like a text's, and its surface is
 * drawn on its image pair, so the frame grows rather than cross-fading. A
 * box flight carries the part class too, then its slot's class
 * ({@link boxSlotClass}).
 */
export const BOX_CLASS = "jf-morph-box";

/** How many box flights one morph draws; one more flies as text. Each slot
 *  has its own rule in viewTransition.scss (`$box-slots`). */
export const MORPH_BOX_SLOTS = 8;

/** The class of box-flight slot `slot`: its rule reads that slot's vars. */
export function boxSlotClass(slot: number): string {
	return `${BOX_CLASS}-${slot}`;
}

/** Each box-flight slot's surfaces, from and to, on `<html>` for the
 *  transition. */
export const BOX_SLOT_VARS = Array.from(
	{ length: MORPH_BOX_SLOTS },
	(_, slot) => ({
		from: surfaceProperties(`--jf-morph-box-${slot}-from`),
		to: surfaceProperties(`--jf-morph-box-${slot}-to`),
	})
);

/** The ghost's box on screen. */
export const GHOST_GEOMETRY_VARS = {
	top: "--jf-ghost-top",
	left: "--jf-ghost-left",
	width: "--jf-ghost-width",
	height: "--jf-ghost-height",
} as const;

/** The `clip-path` cutting the `jf-morph-source` snapshot to what of its
 *  element was on screen, on `<html>` for the transition. */
export const SOURCE_CLIP_VAR = "--jf-morph-source-clip";
