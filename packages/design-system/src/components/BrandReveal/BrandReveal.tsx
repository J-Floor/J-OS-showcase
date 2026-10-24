import {
	createEffect,
	createMemo,
	createSignal,
	on,
	Show,
	untrack,
	type JSX,
} from "solid-js";

import {
	canAnimate,
	moveName,
	type TransitionKind,
} from "../../utils/viewTransition.ts";
import { hasLayoutBox } from "../../utils/visibleArea.ts";
import { LOGO_PART, logoFrameMetrics } from "../Logo/Logo.tsx";

import styles from "./BrandReveal.module.scss";

/** Marks what fills the viewport once the children show: where the logo's
 *  frame grows into when there is no landing. */
export const BRAND_SCREEN = "data-brand-screen";

const FRAME = `[${LOGO_PART}="frame"]`;
const MARK = `[${LOGO_PART}="mark"]`;
const STROKE_VAR = "--jf-brand-stroke";
const CORNER_VAR = "--jf-brand-corner";

/**
 * A box the logo's frame lands on instead of the screen, and the monogram
 * inside it the J lands on. `kind` is added to the transition, so the app's
 * own stylesheet can draw the landing's look (`app-` kinds,
 * viewTransition.ts). During it the box must paint no border of its own: the
 * transition draws the frame.
 */
export type BrandLanding = {
	box: HTMLElement;
	mark?: HTMLElement | null;
	kind: TransitionKind;
};

export type BrandRevealProps = {
	/** True once the children can show; the splash shows until then, and
	 *  again at once if it turns false. */
	ready: boolean;
	/** False: the swap is instant (nothing worth revealing). Read when the
	 *  swap happens. Default true. */
	animate?: boolean;
	/** The splash's content: a full `Logo`, centred on the page background. */
	splash: JSX.Element;
	/** A landing for the logo, looked up just before the new snapshot, so it
	 *  finds what the children rendered; null when none shows. */
	landing?: () => BrandLanding | null;
	children: JSX.Element;
};

/**
 * Runs `flip` as one View Transition: the logo's frame lands on the landing
 * (its J on the landing's monogram), else grows into the `BRAND_SCREEN`
 * element, the children inside it scaling up from the logo's size to the
 * viewport while the J fades; with neither, the logo only fades. Without the
 * API or under reduced motion, the flip is instant.
 */
function reveal(options: {
	splash: HTMLElement | undefined;
	landing: (() => BrandLanding | null) | undefined;
	flip: () => void;
}): Promise<void> {
	const frame = options.splash?.querySelector(FRAME);
	const mark = options.splash?.querySelector(MARK);
	if (!canAnimate() || !hasLayoutBox(frame) || !hasLayoutBox(mark)) {
		options.flip();
		return Promise.resolve();
	}
	const root = document.documentElement;
	const { stroke, corner } = logoFrameMetrics(frame);
	root.style.setProperty(STROKE_VAR, `${stroke}px`);
	root.style.setProperty(CORNER_VAR, `${corner}px`);
	let monogram: HTMLElement | null = null;
	return moveName({
		from: frame,
		name: "jf-brand-frame",
		to: (scope) => {
			const landing = options.landing?.() ?? null;
			if (landing) {
				monogram = landing.mark ?? null;
				scope.kind(landing.kind);
				return landing.box;
			}
			const screen = document.querySelector<HTMLElement>(
				`[${BRAND_SCREEN}]`
			);
			if (!hasLayoutBox(screen)) return null;
			scope.kind("brand-reveal");
			return screen;
		},
		also: [
			{ from: mark, to: () => monogram, name: "jf-brand-mark" },
			// The splash behind the logo: it covers the children until a
			// reveal has grown to the screen (viewTransition.scss).
			{ from: options.splash, to: () => null, name: "jf-brand-backdrop" },
		],
		kind: "brand",
		update: options.flip,
	}).finally(() => {
		root.style.removeProperty(STROKE_VAR);
		root.style.removeProperty(CORNER_VAR);
	});
}

/**
 * A boot splash that gives way to the children: the splash's logo frame
 * grows into the screen (or into a `landing`), and the children appear
 * inside it. The swap happens exactly when `ready` turns true; the
 * transition only wraps it.
 */
export function BrandReveal(props: BrandRevealProps): JSX.Element {
	const isReady = createMemo(() => props.ready);
	const [isShown, setShown] = createSignal(untrack(isReady));
	let splash: HTMLDivElement | undefined;
	function flip(): void {
		// The update runs a frame later; the splash may be wanted again.
		if (untrack(isReady)) setShown(true);
	}
	createEffect(
		on(isReady, (ready) => {
			if (!ready) {
				setShown(false);
				return;
			}
			if (untrack(isShown)) return;
			if (!untrack(() => props.animate ?? true)) {
				flip();
				return;
			}
			void reveal({ splash, landing: props.landing, flip });
		})
	);
	return (
		<Show
			when={isShown()}
			fallback={
				<div
					class={styles.splash}
					data-part="brand-splash"
					ref={(element) => {
						splash = element;
					}}
				>
					{props.splash}
				</div>
			}
		>
			{props.children}
		</Show>
	);
}
