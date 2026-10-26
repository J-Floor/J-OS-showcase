import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	OWN_GESTURES_ATTR,
	listenForSwipe,
	listenForVerticalSwipe,
	ownsGesture,
	swipeDirection,
	verticalSwipeDirection,
} from "./swipe.ts";

let boundary: HTMLElement;

beforeEach(() => {
	boundary = document.createElement("div");
	document.body.append(boundary);
});

afterEach(() => {
	boundary.remove();
	document.getSelection()?.removeAllRanges();
});

function child(html: string): HTMLElement {
	boundary.innerHTML = html;
	const target = boundary.querySelector<HTMLElement>("[data-target]");
	if (!target) throw new Error("fixture needs a [data-target]");
	return target;
}

function parentOf(element: HTMLElement): HTMLElement {
	const parent = element.parentElement;
	if (!parent) throw new Error("fixture needs a parent");
	return parent;
}

function overflowing(element: HTMLElement, isOverflowing: boolean): void {
	Object.defineProperty(element, "scrollWidth", { value: 500 });
	Object.defineProperty(element, "clientWidth", {
		value: isOverflowing ? 300 : 500,
	});
}

describe("ownsGesture", () => {
	test("plain content does not", () => {
		expect(
			ownsGesture(child("<p><span data-target>x</span></p>"), boundary)
		).toBe(false);
	});

	test.each([
		["an input", "<input data-target />"],
		["a textarea", "<textarea data-target></textarea>"],
		["a select", "<select data-target></select>"],
		[
			"contenteditable",
			'<div contenteditable="true"><span data-target>x</span></div>',
		],
		[
			"a native draggable",
			'<div draggable="true"><span data-target>x</span></div>',
		],
		[
			"an element handling its own drags",
			`<div ${OWN_GESTURES_ATTR}><span data-target>x</span></div>`,
		],
	])("%s does", (_name, html) => {
		expect(ownsGesture(child(html), boundary)).toBe(true);
	});

	test('draggable="false" does not', () => {
		expect(
			ownsGesture(
				child(
					'<div draggable="false"><span data-target>x</span></div>'
				),
				boundary
			)
		).toBe(false);
	});

	test("a horizontal scroller that overflows does", () => {
		const target = child(
			'<div style="overflow-x: auto"><span data-target>x</span></div>'
		);
		overflowing(parentOf(target), true);
		expect(ownsGesture(target, boundary)).toBe(true);
	});

	test("a horizontal scroller with nothing to scroll does not", () => {
		const target = child(
			'<div style="overflow-x: scroll"><span data-target>x</span></div>'
		);
		overflowing(parentOf(target), false);
		expect(ownsGesture(target, boundary)).toBe(false);
	});

	test("overflow that clips without scrolling does not", () => {
		const target = child(
			'<div style="overflow-x: hidden"><span data-target>x</span></div>'
		);
		overflowing(parentOf(target), true);
		expect(ownsGesture(target, boundary)).toBe(false);
	});

	test("looks no further than the boundary", () => {
		const outer = document.createElement("div");
		outer.setAttribute(OWN_GESTURES_ATTR, "");
		document.body.append(outer);
		outer.append(boundary);
		try {
			expect(
				ownsGesture(child("<span data-target>x</span>"), boundary)
			).toBe(false);
		} finally {
			document.body.append(boundary);
			outer.remove();
		}
	});
});

describe("swipeDirection", () => {
	test("a long horizontal move is a swipe the way the finger went", () => {
		expect(swipeDirection(-80, 10)).toBe("left");
		expect(swipeDirection(80, -10)).toBe("right");
	});

	test("a short move is not", () => {
		expect(swipeDirection(-20, 0)).toBeUndefined();
	});

	test("a diagonal or vertical move is not", () => {
		expect(swipeDirection(-80, 60)).toBeUndefined();
		expect(swipeDirection(5, 200)).toBeUndefined();
	});
});

describe("verticalSwipeDirection", () => {
	test("a long vertical move is a swipe the way the finger went", () => {
		expect(verticalSwipeDirection(10, 80)).toBe("down");
		expect(verticalSwipeDirection(-10, -80)).toBe("up");
	});

	test("a short, diagonal or horizontal move is not", () => {
		expect(verticalSwipeDirection(0, 20)).toBeUndefined();
		expect(verticalSwipeDirection(60, 80)).toBeUndefined();
		expect(verticalSwipeDirection(200, 5)).toBeUndefined();
	});
});

function scrollingDown(element: HTMLElement, isScrolling: boolean): void {
	Object.defineProperty(element, "scrollHeight", { value: 500 });
	Object.defineProperty(element, "clientHeight", {
		value: isScrolling ? 300 : 500,
	});
}

describe("ownsGesture along the vertical axis", () => {
	test("a vertical scroller that overflows does, a sideways one does not", () => {
		const target = child(
			'<div style="overflow-y: auto"><span data-target>x</span></div>'
		);
		scrollingDown(parentOf(target), true);
		expect(ownsGesture(target, boundary, "vertical")).toBe(true);
		expect(ownsGesture(target, boundary)).toBe(false);
	});

	test("form fields and marked content do on either axis", () => {
		expect(
			ownsGesture(child("<input data-target />"), boundary, "vertical")
		).toBe(true);
	});
});

type Point = { x: number; y: number };

function pointer(
	type: string,
	target: Element,
	at: Point,
	init: PointerEventInit = {}
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			pointerId: 1,
			pointerType: "touch",
			isPrimary: true,
			clientX: at.x,
			clientY: at.y,
			...init,
		})
	);
}

function swipe(target: Element, to: Point, init: PointerEventInit = {}): void {
	pointer("pointerdown", target, { x: 200, y: 100 }, init);
	pointer("pointermove", target, to, init);
	pointer("pointerup", target, to, init);
}

function listen(canStart: (target: Element) => boolean = () => true) {
	const onSwipe = vi.fn();
	const stop = listenForSwipe(boundary, { startsHere: canStart, onSwipe });
	return { onSwipe, stop };
}

describe("listenForSwipe", () => {
	test("reports a touch swipe on pointerup", () => {
		const { onSwipe } = listen();
		const target = child("<p data-target>x</p>");
		swipe(target, { x: 100, y: 105 });
		expect(onSwipe).toHaveBeenCalledWith("left");
		swipe(target, { x: 300, y: 95 });
		expect(onSwipe).toHaveBeenLastCalledWith("right");
	});

	test("a pen swipes too, a mouse does not", () => {
		const { onSwipe } = listen();
		const target = child("<p data-target>x</p>");
		swipe(target, { x: 100, y: 100 }, { pointerType: "mouse" });
		expect(onSwipe).not.toHaveBeenCalled();
		swipe(target, { x: 100, y: 100 }, { pointerType: "pen" });
		expect(onSwipe).toHaveBeenCalledWith("left");
	});

	test("ignores a gesture that starts where startsHere says no", () => {
		const { onSwipe } = listen(() => false);
		swipe(child("<p data-target>x</p>"), { x: 100, y: 100 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("ignores a gesture that starts on content handling its own", () => {
		const { onSwipe } = listen();
		swipe(child(`<div ${OWN_GESTURES_ATTR}><p data-target>x</p></div>`), {
			x: 100,
			y: 100,
		});
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("a cancelled gesture (the browser scrolled) is dropped", () => {
		const { onSwipe } = listen();
		const target = child("<p data-target>x</p>");
		pointer("pointerdown", target, { x: 200, y: 100 });
		pointer("pointercancel", target, { x: 100, y: 100 });
		pointer("pointerup", target, { x: 100, y: 100 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("a second finger drops the gesture", () => {
		const { onSwipe } = listen();
		const target = child("<p data-target>x</p>");
		pointer("pointerdown", target, { x: 200, y: 100 });
		pointer(
			"pointerdown",
			target,
			{ x: 250, y: 100 },
			{ pointerId: 2, isPrimary: false }
		);
		pointer("pointerup", target, { x: 100, y: 100 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("a drag that selected text is not a swipe", () => {
		const { onSwipe } = listen();
		const target = child("<p data-target>some text</p>");
		pointer("pointerdown", target, { x: 200, y: 100 });
		const range = document.createRange();
		range.selectNodeContents(target);
		document.getSelection()?.addRange(range);
		pointer("pointerup", target, { x: 100, y: 100 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("stops listening once cleaned up", () => {
		const { onSwipe, stop } = listen();
		stop();
		swipe(child("<p data-target>x</p>"), { x: 100, y: 100 });
		expect(onSwipe).not.toHaveBeenCalled();
	});
});

function listenVertically() {
	const onSwipe = vi.fn();
	const stop = listenForVerticalSwipe(boundary, {
		startsHere: () => true,
		onSwipe,
	});
	return { onSwipe, stop };
}

describe("listenForVerticalSwipe", () => {
	test("reports a touch swipe down and up on pointerup", () => {
		const { onSwipe } = listenVertically();
		const target = child("<p data-target>x</p>");
		swipe(target, { x: 205, y: 300 });
		expect(onSwipe).toHaveBeenCalledWith("down");
		swipe(target, { x: 195, y: -100 });
		expect(onSwipe).toHaveBeenLastCalledWith("up");
	});

	test("a sideways swipe is not one, and a mouse never swipes", () => {
		const { onSwipe } = listenVertically();
		const target = child("<p data-target>x</p>");
		swipe(target, { x: 100, y: 105 });
		swipe(target, { x: 200, y: 300 }, { pointerType: "mouse" });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("a horizontal listener ignores a vertical swipe", () => {
		const { onSwipe } = listen();
		swipe(child("<p data-target>x</p>"), { x: 205, y: 300 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("ignores a gesture that starts on a vertical scroller that overflows", () => {
		const { onSwipe } = listenVertically();
		const target = child(
			'<div style="overflow-y: auto"><span data-target>x</span></div>'
		);
		scrollingDown(parentOf(target), true);
		swipe(target, { x: 200, y: 300 });
		expect(onSwipe).not.toHaveBeenCalled();
	});

	test("stops listening once cleaned up", () => {
		const { onSwipe, stop } = listenVertically();
		stop();
		swipe(child("<p data-target>x</p>"), { x: 200, y: 300 });
		expect(onSwipe).not.toHaveBeenCalled();
	});
});
