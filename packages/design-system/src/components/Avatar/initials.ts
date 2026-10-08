/** First letter of the first and last word, uppercased. `"Ada Lovelace"` → `"AL"`. */
export function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "";
	const first = words[0][0];
	const last = words.length > 1 ? words[words.length - 1][0] : "";
	// eslint-disable-next-line no-restricted-syntax -- initials are display text, locale-agnostic
	return (first + last).toUpperCase();
}
