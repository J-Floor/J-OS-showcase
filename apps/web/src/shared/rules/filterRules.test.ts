import { expect, test } from "vitest";

import { filterRules, ruleText } from "./filterRules.ts";
import { RULES, type RuleSection } from "./rulesContent.ts";

const sections: RuleSection[] = [
	{
		id: "kitchen",
		heading: "Kitchen",
		rules: [
			[{ strong: "Label your food" }, ". Share it."],
			["Load dirty dishes into the dishwasher."],
		],
	},
	{
		id: "safety",
		heading: "Safety",
		rules: [["Keep exits clear."], ["No smoking near the dishes."]],
	},
];

test("ruleText joins plain and bold segments", () => {
	expect(ruleText([{ strong: "Label your food" }, ". Share it."])).toBe(
		"Label your food. Share it."
	);
});

test("a blank query returns every section untouched", () => {
	expect(filterRules(sections, "  ")).toBe(sections);
});

test("a heading match keeps the whole section", () => {
	expect(filterRules(sections, "kitch")).toEqual([sections[0]]);
});

test("a text match keeps only the matching rules, across sections", () => {
	expect(filterRules(sections, "DISH")).toEqual([
		{ ...sections[0], rules: [sections[0].rules[1]] },
		{ ...sections[1], rules: [sections[1].rules[1]] },
	]);
});

test("bold text is searchable", () => {
	expect(filterRules(sections, "label your")).toEqual([
		{ ...sections[0], rules: [sections[0].rules[0]] },
	]);
});

test("no match gives no sections", () => {
	expect(filterRules(sections, "trampoline")).toEqual([]);
});

test("the real rules have ids that are unique and no empty section", () => {
	expect(new Set(RULES.map((s) => s.id)).size).toBe(RULES.length);
	for (const s of RULES) expect(s.rules.length).toBeGreaterThan(0);
});
