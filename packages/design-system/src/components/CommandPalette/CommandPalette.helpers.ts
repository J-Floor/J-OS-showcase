/**
 * Ranking and recents for {@link CommandPalette}. Ported from EmboUI's
 * `CommandPalette.helpers.ts` — the logic is framework-free, so unlike the
 * component (which was built on the React-only `cmdk`) it carries across
 * unchanged.
 */
import { Result } from "neverthrow";

import { readStored, writeStored } from "../../utils/storage.ts";

const WORD_START_SCORE = 0.9;
const MID_WORD_SCORE = 0.5;
const KEYWORD_SCALE = 0.4;

/** Scores one string. Exact beats word-start beats mid-word. */
function scoreOne(value: string, search: string): number {
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive matching, not UI text
	const lowered = value.toLowerCase();
	const index = lowered.indexOf(search);
	if (index === -1) return 0;
	if (lowered === search) return 1;
	const isAtWordStart = index === 0 || lowered[index - 1] === " ";
	return isAtWordStart ? WORD_START_SCORE : MID_WORD_SCORE;
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
	const needle = search.trim().toLowerCase();
	if (!needle) return 1;

	const direct = scoreOne(value, needle);
	if (direct > 0) return direct;

	// Scaled below 0.5 — the weakest score a match on the name itself can earn —
	// so even an exact keyword ranks under a mid-word match on a real name.
	const keyword = Math.max(
		0,
		...(keywords ?? []).map((term) => scoreOne(term, needle))
	);
	return keyword * KEYWORD_SCALE;
}

/** Move-to-front, dedupe, cap. */
export function addRecent(
	list: string[],
	value: string,
	max: number
): string[] {
	return [value, ...list.filter((entry) => entry !== value)].slice(0, max);
}

const parseJson = Result.fromThrowable((raw: string): unknown =>
	JSON.parse(raw)
);

/** Reads recents from localStorage. Any unusable payload reads as empty. */
export function readRecents(key: string): string[] {
	const raw = readStored("local", key).unwrapOr(null);
	if (raw === null) return [];
	const parsed = parseJson(raw).unwrapOr(undefined);
	return Array.isArray(parsed)
		? parsed.filter((entry): entry is string => typeof entry === "string")
		: [];
}

/** Persists recents. A full or blocked store is not worth breaking a select
 *  over. */
export function writeRecents(key: string, list: string[]): void {
	writeStored("local", key, JSON.stringify(list));
}
