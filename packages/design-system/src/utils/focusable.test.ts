import { expect, test } from "vitest";

import { CONTENT_EDITABLE, FOCUSABLE, FORM_CONTROL } from "./focusable.ts";

function element(html: string): Element {
	const template = document.createElement("template");
	template.innerHTML = html;
	const first = template.content.firstElementChild;
	if (!first) throw new Error("no element in the fixture");
	return first;
}

test("CONTENT_EDITABLE matches every editable value, in any case", () => {
	for (const value of ["", "true", "TRUE", "plaintext-only"]) {
		expect(
			element(`<div contenteditable="${value}"></div>`).matches(
				CONTENT_EDITABLE
			)
		).toBe(true);
	}
	expect(
		element('<div contenteditable="false"></div>').matches(CONTENT_EDITABLE)
	).toBe(false);
});

test("FORM_CONTROL matches the controls a user types or picks in", () => {
	for (const tag of ["input", "textarea", "select"]) {
		expect(element(`<${tag}></${tag}>`).matches(FORM_CONTROL)).toBe(true);
	}
	expect(element("<button></button>").matches(FORM_CONTROL)).toBe(false);
});

test("FOCUSABLE takes buttons, editables and tab stops, not tabindex -1", () => {
	expect(element("<button></button>").matches(FOCUSABLE)).toBe(true);
	expect(element('<div contenteditable=""></div>').matches(FOCUSABLE)).toBe(
		true
	);
	expect(element('<div tabindex="0"></div>').matches(FOCUSABLE)).toBe(true);
	expect(element('<div tabindex="-1"></div>').matches(FOCUSABLE)).toBe(false);
});
