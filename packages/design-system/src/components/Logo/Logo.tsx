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
 */
export function Logo(props: LogoProps): JSX.Element {
	// Unique per instance so multiple Logos don't share one clip definition.
	const clipId = createUniqueId();
	function labelled() {
		return Boolean(props.title);
	}
	function clip() {
		return props.animated ? `url(#${clipId})` : undefined;
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
					<svg
						class={styles.svg}
						viewBox="0 0 132 296"
						fill="currentColor"
						xmlns="http://www.w3.org/2000/svg"
					>
						<Show when={props.animated}>
							<defs>
								<clipPath id={clipId}>
									{/* Grows up from the bottom (see .clip). Static
									    full size is the reduced-motion / no-anim
									    fallback so the mark stays visible. */}
									<rect
										class={styles.clip}
										x="0"
										y="0"
										width="132"
										height="296"
									/>
								</clipPath>
							</defs>
						</Show>
						<g clip-path={clip()}>
							<path d="M83.8954 81.3962C83.8954 91.2205 78.1666 96.5217 66.7092 96.5217H47.3256V89.1004H66.7869C71.4954 89.1004 74.0071 86.3433 74.0071 81.8906V54.6098H53.9954V47.1884H83.8954V81.3962Z" />
							<path
								fill-rule="evenodd"
								clip-rule="evenodd"
								d="M125.099 0.00837862C128.509 0.180634 131.221 2.99195 131.221 6.43478V289.565C131.221 293.008 128.509 295.819 125.099 295.992L124.767 296H6.45349C3.00065 296 0.181159 293.296 0.00840298 289.896L0 289.565V6.43478C0 2.88095 2.88933 6.9094e-08 6.45349 0H124.767L125.099 0.00837862ZM9.68023 286.348H121.541V9.65217H9.68023V286.348Z"
							/>
						</g>
						{/* The growing box's top edge: a full-width bar that rises
						    with the reveal (see .topEdge); rests over the frame's
						    own top border at the end. */}
						<Show when={props.animated}>
							<rect
								class={styles.topEdge}
								x="0"
								y="0"
								width="132"
								height="9.68"
							/>
						</Show>
					</svg>
				}
			>
				<svg
					class={styles.svg}
					viewBox="0 0 60 60"
					fill="currentColor"
					xmlns="http://www.w3.org/2000/svg"
				>
					<Show when={props.animated}>
						<defs>
							<clipPath id={clipId}>
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
						clip-path={clip()}
						d="M47.9995 39.2078C47.9995 49.0321 42.2707 54.3333 30.8133 54.3333H11.4297V46.912H30.891C35.5995 46.912 38.1113 44.1549 38.1113 39.7022V12.4214H18.0996V5H47.9995V39.2078Z"
					/>
				</svg>
			</Show>
		</span>
	);
}
