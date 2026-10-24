import { createRoot, type JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import {
	chipsRenderer,
	clearLabel,
	createOptionPart,
	createHoistedPart,
	createGroupPart,
	keepOpenOnPressIn,
	markOptionText,
	matchesLabel,
	createSelectionParts,
	plainText,
	readParts,
	recordsFor,
	wrapBareText,
	type OptionRecord,
} from "./optionCollection.ts";

const OWNER = "Test.Root";

function renderNothing(): JSX.Element {
	return null;
}

function renderDefault(): JSX.Element {
	return "default";
}

function renderDeclared(): JSX.Element {
	return "declared";
}

/** A marked option-text element, as an `OptionText` part renders it. */
function optionText(text: string): HTMLElement {
	const element = document.createElement("span");
	markOptionText(() => text)(element);
	element.textContent = text;
	return element;
}

/** The option records a Root reads from these resolved children. */
function recordsOf(
	nodes: unknown[],
	kinds: Parameters<typeof readParts>[2]
): OptionRecord[] {
	return createSelectionParts(
		{ toArray: () => nodes },
		OWNER,
		kinds
	).records();
}

function inRoot<T>(run: () => T): T {
	return createRoot((dispose) => {
		const result = run();
		dispose();
		return result;
	});
}

describe("option parts", () => {
	test("an option's label is its plain text children", () => {
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{ value: "a", children: "Alpha" },
						renderNothing
					),
				],
				["option"]
			)
		);
		expect(records).toEqual([
			{ value: "a", label: "Alpha", disabled: false },
		]);
	});

	test("adjacent text joins as it renders, with whitespace collapsed", () => {
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{ value: "b", children: ["Be", "ta"] },
						renderNothing
					),
					createOptionPart(
						{ value: "g", children: [" Gam  ", "ma "] },
						renderNothing
					),
				],
				["option"]
			)
		);
		expect(records.map((record) => record.label)).toEqual([
			"Beta",
			"Gam ma",
		]);
	});

	test("marked option text is the label; other elements add nothing", () => {
		const description = document.createElement("span");
		description.textContent = "The first letter";
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{
							value: "a",
							children: [optionText("Alpha"), description],
						},
						renderNothing
					),
				],
				["option"]
			)
		);
		expect(records[0].label).toBe("Alpha");
	});

	test("an explicit label wins, and a label-less option falls back to its value", () => {
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{ value: "a", label: "Alpha", children: "ignored" },
						renderNothing
					),
					createOptionPart(
						{
							value: "b",
							children: document.createElement("img"),
						},
						renderNothing
					),
				],
				["option"]
			)
		);
		expect(records.map((record) => record.label)).toEqual(["Alpha", "b"]);
	});

	test("disabled reaches the record", () => {
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{ value: "a", disabled: true, children: "A" },
						renderNothing
					),
				],
				["option"]
			)
		);
		expect(records[0].disabled).toBe(true);
	});

	test("records keep render order and descend into groups", () => {
		const records = inRoot(() =>
			recordsOf(
				[
					createOptionPart(
						{ value: "a", children: "A" },
						renderNothing
					),
					createGroupPart(
						{
							children: [
								createHoistedPart("groupLabel", renderNothing),
								createOptionPart(
									{ value: "b", children: "B" },
									renderNothing
								),
								createOptionPart(
									{ value: "c", children: "C" },
									renderNothing
								),
							],
						},
						OWNER,
						renderNothing
					),
				],
				["option", "group"]
			)
		);
		expect(records.map((record) => record.value)).toEqual(["a", "b", "c"]);
	});

	test("a child that is not a part of this root throws", () => {
		expect(() =>
			inRoot(() =>
				readParts([document.createElement("div")], OWNER, ["option"])
			)
		).toThrow(/Test\.Root/);
		expect(() =>
			inRoot(() =>
				readParts([createHoistedPart("empty", renderNothing)], OWNER, [
					"option",
				])
			)
		).toThrow(/Test\.Root/);
	});

	test("empty children are skipped", () => {
		expect(
			inRoot(() =>
				readParts([null, undefined, false, ""], OWNER, ["option"])
			)
		).toEqual([]);
	});
});

describe("wrapBareText", () => {
	test("wraps each run of bare text", () => {
		const icon = document.createElement("i");
		expect(
			wrapBareText([icon, "Al", "pha"], (text) => `[${text}]`)
		).toEqual([icon, "[Alpha]"]);
	});

	test("leaves the children alone when they already hold option text", () => {
		const nodes = ["x", optionText("Alpha")];
		expect(wrapBareText(nodes, (text) => `[${text}]`)).toBe(nodes);
	});
});

describe("matchesLabel", () => {
	test("is a case-insensitive substring match on the label", () => {
		const option = { value: "h", label: "Healthcare", disabled: false };
		expect(matchesLabel("HEALTH", option)).toBe(true);
		expect(matchesLabel("h", { ...option, label: "SaaS" })).toBe(false);
	});
});

describe("recordsFor", () => {
	test("the records of the selected values, in selection order", () => {
		const records = [
			{ value: "a", label: "A", disabled: false },
			{ value: "b", label: "B", disabled: false },
		];
		expect(recordsFor(["b", "gone", "a"], records)).toEqual([
			records[1],
			records[0],
		]);
	});
});

describe("chipsRenderer", () => {
	test("a declared SelectedOptions part wins, else multiple shows the default", () => {
		const declared = inRoot(() =>
			readParts(
				[createHoistedPart("selectedOptions", renderDeclared)],
				OWNER,
				["selectedOptions"]
			)
		);
		expect(chipsRenderer(declared, false, renderDefault)).toBe(
			renderDeclared
		);
		expect(chipsRenderer([], true, renderDefault)).toBe(renderDefault);
		expect(chipsRenderer([], false, renderDefault)).toBeUndefined();
	});
});

describe("plainText", () => {
	test("joins the strings and numbers, skipping elements", () => {
		expect(plainText(["Room ", 4, document.createElement("i")])).toBe(
			"Room 4"
		);
	});
});

/** The outside-press event zag fires, reduced to what the handler reads. */
function pressOn(target: EventTarget) {
	return {
		detail: { target },
		defaultPrevented: false,
		preventDefault(): void {
			this.defaultPrevented = true;
		},
	};
}

describe("keepOpenOnPressIn", () => {
	test("a press inside the element is not an outside press; others are", () => {
		const control = document.createElement("div");
		const chevron = document.createElement("span");
		control.append(chevron);
		const onPointerDownOutside = vi.fn();
		const handler = keepOpenOnPressIn(() => control, onPointerDownOutside);

		const inside = pressOn(chevron);
		handler(inside);
		expect(inside.defaultPrevented).toBe(true);

		const outside = pressOn(document.body);
		handler(outside);
		expect(outside.defaultPrevented).toBe(false);
		expect(onPointerDownOutside).toHaveBeenCalledTimes(2);
	});
});

describe("clearLabel", () => {
	test("says whether it clears one selection or many", () => {
		expect(clearLabel(1)).toBe("Clear value");
		expect(clearLabel(2)).toBe("Clear all");
	});
});
