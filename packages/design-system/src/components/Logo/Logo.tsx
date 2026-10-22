import type { JSX } from "solid-js";
import { Show, createUniqueId } from "solid-js";

import styles from "./Logo.module.scss";

export type LogoProps = {
	/** "monogram" = the standalone J mark (square); "logo" = the framed full
	 * lockup (tall). Defaults to the full logo. */
	variant?: "monogram" | "logo";
	/** Accessible label. When set the mark is exposed as an image with this
	 * name; when omitted (default) it is decorative (`aria-hidden`). */
	title?: string;
	/** Play a one-shot reveal on mount: a rectangle mask grows up from the
	 * bottom, its top edge rising, revealing the (fixed, undistorted) mark
	 * inside. No-op under `prefers-reduced-motion`. Defaults to static. */
	animated?: boolean;
	class?: string;
};

/** The frame in viewBox units: its width (the drawn path's, so the frame
 *  part's box is the drawn frame and a morph lands on its edge), its height,
 *  stroke and outer corner radius. */
const FRAME_WIDTH = 131.221;
const FRAME_HEIGHT = 296;
const FRAME_STROKE = 9.68;
const FRAME_CORNER = 6.45;
const CLIP_WIDTH = 132;

const FRAME_VIEW_BOX = `0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`;

/** Marks each part of the logo: `frame` and `mark` (the J). */
export const LOGO_PART = "data-logo-part";

/**
 * The stroke and outer corner radius, in px, of a rendered full logo's frame:
 * pass its `[data-logo-part="frame"]` element. For drawing that frame live
 * (the boot transition draws it as an inset box-shadow ring).
 */
export function logoFrameMetrics(frame: Element): {
	stroke: number;
	corner: number;
} {
	const unit = frame.getBoundingClientRect().height / FRAME_HEIGHT;
	return { stroke: unit * FRAME_STROKE, corner: unit * FRAME_CORNER };
}

/**
 * The J's square in the full lockup: the monogram's 60x60 box, moved to where
 * the J sits. The mark part is cropped to it, so it has the monogram's aspect
 * and morphs into it by scale and translate alone. Its place in the lockup is
 * mirrored by `.fullMark` (Logo.module.scss).
 */
const FULL_MARK_VIEW_BOX = "35.8959 42.1884 60 60";

/** The clip reference an animated mark masks itself with. */
function clipReference(
	isAnimated: boolean | undefined,
	clipId: string
): string | undefined {
	return isAnimated ? `url(#${clipId})` : undefined;
}

/** Reveals the full lockup from the bottom (see .clip). Its static full size
 *  is the reduced-motion fallback, so the mark stays visible. */
function FullClip(props: { id: string }): JSX.Element {
	return (
		<defs>
			<clipPath id={props.id}>
				<rect
					class={styles.clip}
					x="0"
					y="0"
					width={CLIP_WIDTH}
					height={FRAME_HEIGHT}
				/>
			</clipPath>
		</defs>
	);
}

/**
 * The framed full lockup, as two parts stacked in one box: the frame and,
 * over it, the J. Both draw in the lockup's coordinates, so the result is the
 * single-SVG logo pixel for pixel and the reveal clips both alike. They are
 * separate elements so a View Transition can move each on its own.
 */
function FullMark(props: {
	isAnimated: boolean | undefined;
	clipId: string;
}): JSX.Element {
	function frameClip(): string {
		return `${props.clipId}-frame`;
	}
	function markClip(): string {
		return `${props.clipId}-mark`;
	}
	return (
		<span class={styles.full}>
			<span class={styles.part} {...{ [LOGO_PART]: "frame" }}>
				<svg
					class={styles.svg}
					viewBox={FRAME_VIEW_BOX}
					fill="currentColor"
					xmlns="http://www.w3.org/2000/svg"
				>
					<Show when={props.isAnimated}>
						<FullClip id={frameClip()} />
					</Show>
					<path
						clip-path={clipReference(props.isAnimated, frameClip())}
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M125.099 0.00837862C128.509 0.180634 131.221 2.99195 131.221 6.43478V289.565C131.221 293.008 128.509 295.819 125.099 295.992L124.767 296H6.45349C3.00065 296 0.181159 293.296 0.00840298 289.896L0 289.565V6.43478C0 2.88095 2.88933 6.9094e-08 6.45349 0H124.767L125.099 0.00837862ZM9.68023 286.348H121.541V9.65217H9.68023V286.348Z"
					/>
					{/* The growing box's top edge: a full-width bar that rises
					    with the reveal (see .topEdge); rests over the frame's
					    own top border at the end. */}
					<Show when={props.isAnimated}>
						<rect
							class={styles.topEdge}
							x="0"
							y="0"
							width={CLIP_WIDTH}
							height={FRAME_STROKE}
						/>
					</Show>
				</svg>
			</span>
			<span class={styles.fullMark} {...{ [LOGO_PART]: "mark" }}>
				<svg
					class={styles.fill}
					viewBox={FULL_MARK_VIEW_BOX}
					fill="currentColor"
					xmlns="http://www.w3.org/2000/svg"
				>
					<Show when={props.isAnimated}>
						<FullClip id={markClip()} />
					</Show>
					<path
						clip-path={clipReference(props.isAnimated, markClip())}
						d="M83.8954 81.3962C83.8954 91.2205 78.1666 96.5217 66.7092 96.5217H47.3256V89.1004H66.7869C71.4954 89.1004 74.0071 86.3433 74.0071 81.8906V54.6098H53.9954V47.1884H83.8954V81.3962Z"
					/>
				</svg>
			</span>
		</span>
	);
}

/** The standalone J mark. */
function Monogram(props: {
	isAnimated: boolean | undefined;
	clipId: string;
}): JSX.Element {
	return (
		<span class={styles.part} {...{ [LOGO_PART]: "mark" }}>
			<svg
				class={styles.svg}
				viewBox="0 0 60 60"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
			>
				<Show when={props.isAnimated}>
					<defs>
						<clipPath id={props.clipId}>
							<rect
								class={styles.clipSquare}
								x="0"
								y="0"
								width="60"
								height="60"
							/>
						</clipPath>
					</defs>
				</Show>
				<path
					clip-path={clipReference(props.isAnimated, props.clipId)}
					d="M47.9995 39.2078C47.9995 49.0321 42.2707 54.3333 30.8133 54.3333H11.4297V46.912H30.891C35.5995 46.912 38.1113 44.1549 38.1113 39.7022V12.4214H18.0996V5H47.9995V39.2078Z"
				/>
			</svg>
		</span>
	);
}

/**
 * The J floor brand mark, inlined as SVG so it themes with `currentColor`: the
 * root sets `color` (a token by default) and the paths fill from it, so the
 * single component covers the old black/white asset pair across light/dark.
 *
 * Size it through `font-size` on the root (via `class`/`style`) — the SVG is
 * `block-size: 1em` with `inline-size: auto`, so it scales without distorting.
 *
 * `animated` reveals the mark via a growing-rectangle clip (the mark stays
 * fixed and undistorted; only the mask grows), with a visible top edge that
 * rises as the box grows.
 *
 * Each part carries `data-logo-part`: the full logo has `frame` and `mark`
 * (the J), the monogram has `mark`. The app's boot transition morphs them
 * into the sidebar's rail and monogram.
 */
export function Logo(props: LogoProps): JSX.Element {
	// Unique per instance so multiple Logos don't share one clip definition.
	const clipId = createUniqueId();
	function labelled() {
		return Boolean(props.title);
	}
	return (
		<span
			class={props.class ? `${styles.root} ${props.class}` : styles.root}
			role={labelled() ? "img" : undefined}
			aria-label={labelled() ? props.title : undefined}
			aria-hidden={labelled() ? undefined : "true"}
		>
			<Show
				when={(props.variant ?? "logo") === "monogram"}
				fallback={
					<FullMark isAnimated={props.animated} clipId={clipId} />
				}
			>
				<Monogram isAnimated={props.animated} clipId={clipId} />
			</Show>
		</span>
	);
}
