import {
	type BrandLanding,
	hasLayoutBox,
	LOGO_PART,
} from "@j-os/design-system";

import "./brandUnfold.scss";

/** Marks the sidebar rail: the boot transition unfolds the splash logo into it. */
export const BRAND_FRAME = "data-brand-frame";

/**
 * Where the splash logo lands at boot: the sidebar rail, its J on the rail's
 * monogram (kind `app-brand-unfold`, drawn in brandUnfold.scss). Null where
 * the rail or its monogram shows no box (a phone's bottom bar hides the
 * monogram): the logo's frame then becomes the screen instead.
 */
export function railLanding(): BrandLanding | null {
	const rail = document.querySelector<HTMLElement>(`[${BRAND_FRAME}]`);
	const mark = rail?.querySelector<HTMLElement>(`[${LOGO_PART}="mark"]`);
	return hasLayoutBox(rail) && hasLayoutBox(mark)
		? { box: rail, mark, kind: "app-brand-unfold" }
		: null;
}
