/** Hook that computes prev/next navigation over an ordered list of items,
 * identified by `_id`. Disable arrows at the ends (no wrap). */
export function createDrawerNav<T extends { _id: string }>(opts: {
	items: () => readonly T[];
	currentId: () => string | undefined;
	onSelect: (item: T) => void;
}): {
	hasPrev: () => boolean;
	hasNext: () => boolean;
	prev: () => void;
	next: () => void;
} {
	function index(): number {
		return opts.items().findIndex((i) => i._id === opts.currentId());
	}
	function hasPrev(): boolean {
		return index() > 0;
	}
	function hasNext(): boolean {
		const i = index();
		return i >= 0 && i < opts.items().length - 1;
	}
	function prev(): void {
		if (hasPrev()) opts.onSelect(opts.items()[index() - 1]);
	}
	function next(): void {
		if (hasNext()) opts.onSelect(opts.items()[index() + 1]);
	}
	return { hasPrev, hasNext, prev, next };
}
