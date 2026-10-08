import { isStrong, type Rule, type RuleSection } from "./rulesContent.ts";

/** A rule's text with the bold runs flattened in — what search matches on. */
export function ruleText(rule: Rule): string {
	return rule.map((s) => (isStrong(s) ? s.strong : s)).join("");
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
	const q = query.trim().toLowerCase();
	if (q === "") return sections;
	return sections.flatMap((section) => {
		// eslint-disable-next-line no-restricted-syntax -- case-insensitive search, not UI text
		if (section.heading.toLowerCase().includes(q)) return [section];
		const rules = section.rules.filter((rule) =>
			// eslint-disable-next-line no-restricted-syntax -- case-insensitive search, not UI text
			ruleText(rule).toLowerCase().includes(q)
		);
		return rules.length > 0 ? [{ ...section, rules }] : [];
	});
}
