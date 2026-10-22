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
 * monogram), only the logo is named and it fades out. Without the API or
 * under reduced motion, the flip is instant.
 */
export function unfoldLogo(options: {
	logo: HTMLElement | undefined;
	landing: () => HTMLElement | null;
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
			if (!hasLayoutBox(rail) || !hasLayoutBox(railMark)) return null;
			monogram = railMark;
			scope.kind("brand-unfold");
			return rail;
		},
		also: [{ from: mark, to: () => monogram, name: "jf-brand-mark" }],
		kind: "brand",
		update: options.flip,
	}).finally(() => {
		root.style.removeProperty(STROKE_VAR);
		root.style.removeProperty(CORNER_VAR);
	});
}
