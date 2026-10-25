import type { EntityRow } from "../shared/types.ts";

/** Prev/next over the rows a tab is displaying, in the shape a sheet's
 *  header hands to `SheetNav`. */
export type SheetNavState = {
	hasPrev: () => boolean;
	hasNext: () => boolean;
	onPrev: () => void;
	onNext: () => void;
};

/** Hook that computes prev/next navigation over an ordered list of items,
 * identified by `_id`. Disable arrows at the ends (no wrap). */
export function createSheetNav<T extends EntityRow>(options: {
	items: () => readonly T[];
	currentId: () => string | undefined;
	onSelect: (item: T) => void;
}): SheetNavState {
	function index(): number {
		return options
			.items()
			.findIndex((item) => item._id === options.currentId());
	}
	function hasPrev(): boolean {
		return index() > 0;
	}
	function hasNext(): boolean {
		const position = index();
		return position >= 0 && position < options.items().length - 1;
	}
	function prev(): void {
		if (hasPrev()) options.onSelect(options.items()[index() - 1]);
	}
	function next(): void {
		if (hasNext()) options.onSelect(options.items()[index() + 1]);
	}
	return { hasPrev, hasNext, onPrev: prev, onNext: next };
}
