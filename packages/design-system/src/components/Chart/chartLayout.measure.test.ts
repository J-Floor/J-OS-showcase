import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createMeasuredSize } from "./chartLayout.ts";

type Callback = (entries: { contentRect: DOMRectReadOnly }[]) => void;

let callback: Callback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

class FakeResizeObserver {
	constructor(onResize: Callback) {
		callback = onResize;
	}
	observe = observe;
	disconnect = disconnect;
}

function entry(width: number, height: number) {
	return { contentRect: { width, height } as DOMRectReadOnly };
}

beforeEach(() => {
	callback = undefined;
	observe.mockReset();
	disconnect.mockReset();
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

function mount() {
	const element = document.createElement("div");
	const { size, dispose } = createRoot((done) => {
		const result = createMeasuredSize();
		result.measure(element);
		return { size: result, dispose: done };
	});
	return { size, element, dispose };
}

test("starts from the assumed size and takes the observed one", () => {
	const { size, element } = mount();
	const assumed = { width: size.width(), height: size.height() };
	expect(assumed.width).toBeGreaterThan(0);
	expect(observe).toHaveBeenCalledWith(element);

	callback?.([entry(321, 123)]);
	expect(size.width()).toBe(321);
	expect(size.height()).toBe(123);
});

test("keeps the previous size for a collapsed (zero) dimension", () => {
	const { size } = mount();
	callback?.([entry(300, 200)]);
	callback?.([entry(0, 250)]);
	expect(size.width()).toBe(300);
	expect(size.height()).toBe(250);
	callback?.([entry(280, 0)]);
	expect(size.width()).toBe(280);
	expect(size.height()).toBe(250);
});

test("an empty entry list changes nothing", () => {
	const { size } = mount();
	const before = { width: size.width(), height: size.height() };
	callback?.([]);
	expect({ width: size.width(), height: size.height() }).toEqual(before);
});

test("stops observing when its owner is disposed", () => {
	const { dispose } = mount();
	expect(disconnect).not.toHaveBeenCalled();
	dispose();
	expect(disconnect).toHaveBeenCalledOnce();
});

test("without ResizeObserver the assumed size stays", () => {
	vi.stubGlobal("ResizeObserver", undefined);
	const { size } = mount();
	expect(size.width()).toBeGreaterThan(0);
	expect(observe).not.toHaveBeenCalled();
});
