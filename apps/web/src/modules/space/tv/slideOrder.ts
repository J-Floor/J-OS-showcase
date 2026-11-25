/** The slide ids after `from` is dropped where `to` is: `from` takes the
 *  index `to` had. An unknown id, or `from` equal to `to`, changes nothing:
 *  the very array given comes back, so the caller tests `next === ids`. */
export function resolveReorder(
	ids: string[],
	from: string,
	to: string
): string[] {
	const fromIndex = ids.indexOf(from);
	const toIndex = ids.indexOf(to);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return ids;
	}
	const next = ids.filter((id) => id !== from);
	next.splice(toIndex, 0, from);
	return next;
}
