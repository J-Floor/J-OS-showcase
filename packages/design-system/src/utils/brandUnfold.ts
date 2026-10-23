import { LOGO_PART, logoFrameMetrics } from "../components/Logo/Logo.tsx";

import { canAnimate, moveName } from "./viewTransition.ts";
import { hasLayoutBox } from "./visibleArea.ts";

const FRAME = `[${LOGO_PART}="frame"]`;
const MARK = `[${LOGO_PART}="mark"]`;
const STROKE_VAR = "--jf-brand-stroke";
const CORNER_VAR = "--jf-brand-corner";

/**
 * Runs `flip` (a full logo leaves, a frame with a monogram arrives) as one
 * View Transition: the logo's frame grows into `landing()`'s border and its J
 * lands on the monogram inside it (the `Logo`'s mark part). `landing` is
 * looked up just before the new snapshot, so it finds what `flip` rendered.
 * When the landing or its monogram has no box (the phone tab bar hides the
 * monogram), the frame grows into `screen()` instead, the app inside it
 * scaling up from the logo's size to the viewport, and the J fades out; with
 * no screen either, the logo only fades. Without the API or under reduced
 * motion, the flip is instant.
 */
export function unfoldLogo(options: {
	logo: HTMLElement | undefined;
	landing: () => HTMLElement | null;
	/** What fills the viewport once the flip ran (the app's shell): where the
	 *  frame lands when the landing shows no monogram. */
	screen?: () => HTMLElement | null;
	flip: () => void;
}): Promise<void> {
	const frame = options.logo?.querySelector(FRAME);
	const mark = options.logo?.querySelector(MARK);
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
			const rail = options.landing();
			const railMark = rail?.querySelector(MARK);
			if (hasLayoutBox(rail) && hasLayoutBox(railMark)) {
				monogram = railMark;
				scope.kind("brand-unfold");
				return rail;
			}
			const screen = options.screen?.() ?? null;
			if (!hasLayoutBox(screen)) return null;
			scope.kind("brand-reveal");
			return screen;
		},
		also: [
			{ from: mark, to: () => monogram, name: "jf-brand-mark" },
			// The splash behind the logo: it covers the app until a reveal
			// has grown to the screen (viewTransition.scss).
			{ from: options.logo, to: () => null, name: "jf-brand-backdrop" },
		],
		kind: "brand",
		update: options.flip,
	}).finally(() => {
		root.style.removeProperty(STROKE_VAR);
		root.style.removeProperty(CORNER_VAR);
	});
}
