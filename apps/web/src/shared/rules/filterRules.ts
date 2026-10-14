import { isStrong, type Rule, type RuleSection } from "./rulesContent.ts";

/** A rule's text with the bold runs flattened in — what search matches on. */
export function ruleText(rule: Rule): string {
	return rule
		.map((segment) => (isStrong(segment) ? segment.strong : segment))
		.join("");
}

/**
 * The sections and rules that match `query`, case-insensitively. A section
 * whose heading matches keeps every rule — searching "kitchen" should show the
 * kitchen rules. Otherwise only the matching rules stay, and a section left
 * with none is dropped. A blank query returns the input as is.
 */
export function filterRules(
	sections: readonly RuleSection[],
	query: string
): readonly RuleSection[] {
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive search, not UI text
	const needle = query.trim().toLowerCase();
	if (needle === "") return sections;
	return sections.flatMap((section) => {
		// eslint-disable-next-line no-restricted-syntax -- case-insensitive search, not UI text
		if (section.heading.toLowerCase().includes(needle)) return [section];
		const rules = section.rules.filter((rule) =>
			// eslint-disable-next-line no-restricted-syntax -- case-insensitive search, not UI text
			ruleText(rule).toLowerCase().includes(needle)
		);
		return rules.length > 0 ? [{ ...section, rules }] : [];
	});
}
