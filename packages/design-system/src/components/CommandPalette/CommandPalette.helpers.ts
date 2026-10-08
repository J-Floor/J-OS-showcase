/**
 * Ranking and recents for {@link CommandPalette}. Ported from EmboUI's
 * `CommandPalette.helpers.ts` — the logic is framework-free, so unlike the
 * component (which was built on the React-only `cmdk`) it carries across
 * unchanged.
 */

/** Scores one string. Exact beats word-start beats mid-word. */
function scoreOne(value: string, search: string): number {
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive matching, not UI text
	const v = value.toLowerCase();
	const idx = v.indexOf(search);
	if (idx === -1) return 0;
	if (v === search) return 1;
	const atWordStart = idx === 0 || v[idx - 1] === " ";
	return atWordStart ? 0.9 : 0.5;
}

/**
 * Ranking filter for the palette. A loose fuzzy match surfaces junk — EmboUI
 * found "menu" matching "Implementing your own app" — so this requires a real
 * substring and ranks exact > word-start > mid-word, letting the obvious hit
 * win.
 *
 * `keywords` are scored too, and always rank below the item's own name: a
 * keyword is a way to be found, not a better name for the thing.
 */
export function scoreMatch(
	value: string,
	search: string,
	keywords?: string[]
): number {
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive matching, not UI text
	const s = search.trim().toLowerCase();
	if (!s) return 1;

	const direct = scoreOne(value, s);
	if (direct > 0) return direct;

	// Scaled below 0.5 — the weakest score a match on the name itself can earn —
	// so even an exact keyword ranks under a mid-word match on a real name.
	const keyword = Math.max(0, ...(keywords ?? []).map((k) => scoreOne(k, s)));
	return keyword * 0.4;
}

/** Move-to-front, dedupe, cap. */
export function addRecent(
	list: string[],
	value: string,
	max: number
): string[] {
	return [value, ...list.filter((v) => v !== value)].slice(0, max);
}

/** Reads recents from localStorage. Any unusable payload reads as empty. */
export function readRecents(key: string): string[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is string => typeof v === "string");
	} catch {
		return [];
	}
}

/** Persists recents. A full or blocked store is not worth throwing over. */
export function writeRecents(key: string, list: string[]): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(key, JSON.stringify(list));
	} catch {
		// Storage full or blocked. Recents are not worth breaking a select over.
	}
}
