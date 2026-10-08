import { isTypingTarget } from "./typingTarget.ts";

function el(html: string): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = html;
	document.body.append(host);
	return host.firstElementChild as HTMLElement;
}

test("a text input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="text" />`))).toBe(true);
});

test("a textarea is a typing target", () => {
	expect(isTypingTarget(el(`<textarea></textarea>`))).toBe(true);
});

test("a contenteditable element is a typing target", () => {
	expect(isTypingTarget(el(`<div contenteditable="true"></div>`))).toBe(true);
});

test("a checkbox is not a typing target", () => {
	expect(isTypingTarget(el(`<input type="checkbox" />`))).toBe(false);
});

test("a plain button is not a typing target", () => {
	expect(isTypingTarget(el(`<button>go</button>`))).toBe(false);
});

test("anything inside an open dialog is a typing target", () => {
	const button = el(
		`<div role="dialog" data-state="open"><button>confirm</button></div>`
	).querySelector("button");
	expect(isTypingTarget(button)).toBe(true);
});

test("a control inside a dialog that opts out with data-shortcut-surface is NOT a typing target", () => {
	// The person drawer marks itself so its bare-letter shortcuts and nav arrows
	// fire while focus rests in it — unlike a confirm dialog, deciding the thing
	// it shows IS its job.
	const button = el(
		`<div role="dialog" data-state="open" data-shortcut-surface="true"><button>make guest</button></div>`
	).querySelector("button");
	expect(isTypingTarget(button)).toBe(false);
});

test("an option inside a portaled listbox is a typing target", () => {
	// A Select/Combobox list portals to <body>, outside any dialog — its Enter
	// (pick) and arrows (move) must win over a roster row shortcut behind it.
	const option = el(
		`<div role="listbox"><div role="option">Ada</div></div>`
	).querySelector('[role="option"]');
	expect(isTypingTarget(option)).toBe(true);
});

test("a menu item is a typing target", () => {
	const item = el(
		`<div role="menu"><div role="menuitem">Delete</div></div>`
	).querySelector('[role="menuitem"]');
	expect(isTypingTarget(item)).toBe(true);
});

test("a datepicker calendar grid is a typing target", () => {
	expect(isTypingTarget(el(`<div role="grid"></div>`))).toBe(true);
});

test("a real input inside a shortcut-surface dialog is STILL a typing target", () => {
	// Opting the panel out of the dialog rule must not let a note field swallow
	// shortcuts — the input check still catches it.
	const input = el(
		`<div role="dialog" data-state="open" data-shortcut-surface="true"><input type="text" /></div>`
	).querySelector("input");
	expect(isTypingTarget(input)).toBe(true);
});

test("null is not a typing target", () => {
	expect(isTypingTarget(null)).toBe(false);
});

test("a number input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="number" />`))).toBe(true);
});

test("an element nested inside a contenteditable region is a typing target", () => {
	const span = el(
		`<div contenteditable="true"><span>hi</span></div>`
	).querySelector("span");
	expect(isTypingTarget(span)).toBe(true);
});

test("a plaintext-only contenteditable element is a typing target", () => {
	expect(
		isTypingTarget(el(`<div contenteditable="plaintext-only"></div>`))
	).toBe(true);
});

test("an uppercase contenteditable value is a typing target", () => {
	expect(isTypingTarget(el(`<div contenteditable="TRUE"></div>`))).toBe(true);
});

test("a select is a typing target", () => {
	expect(isTypingTarget(el(`<select><option>a</option></select>`))).toBe(
		true
	);
});

test("a date input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="date" />`))).toBe(true);
});

test("a time input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="time" />`))).toBe(true);
});

test("a datetime-local input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="datetime-local" />`))).toBe(true);
});

test("a month input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="month" />`))).toBe(true);
});

test("a week input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="week" />`))).toBe(true);
});

test("a range input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="range" />`))).toBe(true);
});

test("a color input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="color" />`))).toBe(true);
});

test("a file input is a typing target", () => {
	expect(isTypingTarget(el(`<input type="file" />`))).toBe(true);
});

test("a radio input is not a typing target", () => {
	expect(isTypingTarget(el(`<input type="radio" />`))).toBe(false);
});

test("a focused table grid is NOT a typing target", () => {
	expect(
		isTypingTarget(
			el(`<table role="grid" data-table-grid tabindex="0"></table>`)
		)
	).toBe(false);
});

test("a text input inside the table grid IS a typing target", () => {
	const input = el(
		`<table role="grid" data-table-grid tabindex="0"><tbody><tr><td><input type="text" /></td></tr></tbody></table>`
	).querySelector("input");
	expect(isTypingTarget(input)).toBe(true);
});

test("a plain role=grid (the calendar) is still a typing target", () => {
	expect(isTypingTarget(el(`<table role="grid" tabindex="0"></table>`))).toBe(
		true
	);
});
