import { fieldBoxHandlers } from "./makeFieldProps.ts";

type Box = {
	input: HTMLInputElement;
	span: HTMLElement;
	button: HTMLElement;
	own: HTMLElement;
	inputClicks: () => number;
};

function mount(): Box {
	const box = document.createElement("div");
	box.innerHTML = `<span id="span">i</span><input id="input" /><button id="button">x</button><span data-own><b id="own">o</b></span>`;
	document.body.append(box);
	const input = box.querySelector<HTMLInputElement>("#input")!;
	const handlers = fieldBoxHandlers(
		() => input,
		(target) => target.closest("[data-own]") !== null
	);
	box.addEventListener("mousedown", handlers.onMouseDown);
	box.addEventListener("click", handlers.onClick);
	let clicks = 0;
	input.addEventListener("click", () => {
		clicks += 1;
	});
	return {
		input,
		span: box.querySelector<HTMLElement>("#span")!,
		button: box.querySelector<HTMLElement>("#button")!,
		own: box.querySelector<HTMLElement>("#own")!,
		inputClicks: () => clicks,
	};
}

function press(target: Element, type: "mousedown" | "click"): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	document.body.innerHTML = "";
});

test("a click on a static part focuses the control and clicks it once", () => {
	const box = mount();
	press(box.span, "click");
	expect(box.input).toHaveFocus();
	expect(box.inputClicks()).toBe(1);
});

test("a mousedown on a static part keeps the native press from moving focus", () => {
	const box = mount();
	expect(press(box.span, "mousedown").defaultPrevented).toBe(true);
});

test("a click on the control itself clicks it once, not again", () => {
	const box = mount();
	press(box.input, "click");
	expect(box.inputClicks()).toBe(1);
});

test("a press on the control leaves the native press alone", () => {
	const box = mount();
	expect(press(box.input, "mousedown").defaultPrevented).toBe(false);
});

test.each(["button", "own"] as const)(
	"a press on the %s part leaves the control alone",
	(part) => {
		const box = mount();
		expect(press(box[part], "mousedown").defaultPrevented).toBe(false);
		press(box[part], "click");
		expect(box.input).not.toHaveFocus();
		expect(box.inputClicks()).toBe(0);
	}
);

test("a disabled control is left alone", () => {
	const box = mount();
	box.input.disabled = true;
	expect(press(box.span, "mousedown").defaultPrevented).toBe(false);
	press(box.span, "click");
	expect(box.inputClicks()).toBe(0);
});

test("a control that is aria-disabled is left alone", () => {
	const box = mount();
	box.input.setAttribute("aria-disabled", "true");
	expect(press(box.span, "mousedown").defaultPrevented).toBe(false);
	press(box.span, "click");
	expect(box.inputClicks()).toBe(0);
});

test("a control with aria-disabled false still takes the box's press", () => {
	const box = mount();
	box.input.setAttribute("aria-disabled", "false");
	press(box.span, "click");
	expect(box.inputClicks()).toBe(1);
});

test("a missing control is left alone", () => {
	const handlers = fieldBoxHandlers(() => {});
	const event = new MouseEvent("mousedown", { cancelable: true });
	handlers.onMouseDown(event);
	expect(event.defaultPrevented).toBe(false);
});
