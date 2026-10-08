import type { Id } from "../../../../convex/_generated/dataModel";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";

/** All the selection needs of a roster row: who it is. */
export type PersonRef = { _id: Id<"people"> };

/** The page-wide person selection every roster tab is handed. */
export type PersonSelection = EntitySelection<PersonRef>;

/**
 * What the page hands each roster tab.
 */
export type TabProps = {
	/**
	 * The page-wide person selection. The URL's `?person=` is its single source
	 * of truth; every roster tab gets the same one and shows its drawer only for
	 * a person in its own rows.
	 */
	selection: PersonSelection;
	/**
	 * Whether this tab is the one on screen right now.
	 *
	 * All three tabs stay mounted once visited (`lazyMount`, not
	 * `unmountOnExit`), so a hidden tab's own action keys would otherwise fire
	 * on rows nobody can see. The selection alone cannot stand in for this: it
	 * is only ever set while a drawer is open (or a deep link is arriving), so a
	 * tab sitting on screen with the roster idle — the everyday case a
	 * focused-row key press is FOR — reads as "nobody selected" whether or not
	 * it is the tab actually showing.
	 *
	 * Optional, defaulting to `false` (keys off), so a tab stays renderable in
	 * isolation — a unit test mounting one tab alone, a future storybook.
	 */
	active?: boolean;
};
