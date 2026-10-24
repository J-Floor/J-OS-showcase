import { render } from "@solidjs/testing-library";
import { expect, test, vi } from "vitest";

import { Skeleton } from "./Skeleton.tsx";

vi.mock("./skeletonMeasure.ts", () => ({
	observeResize: () => vi.fn(),
	measureLeaves: () => [
		{ x: 1, y: 2, width: 30, height: 40, borderRadius: "0px" },
		{ x: 5, y: 6, width: 70, height: 80, borderRadius: "8px" },
	],
}));

function blocks(container: HTMLElement): HTMLElement[] {
	const overlay = container.querySelector("[data-shimmer-container]")
		?.lastElementChild as HTMLElement;
	return [...overlay.children] as HTMLElement[];
}

test("measured blocks get their geometry through custom properties only", () => {
	const { container } = render(() => (
		<Skeleton visible={true}>
			<p>Loading me</p>
		</Skeleton>
	));
	const [first, second] = blocks(container);
	for (const block of [first, second]) {
		for (const property of ["left", "top", "width", "height"]) {
			expect(block.style.getPropertyValue(property)).toBe("");
		}
		expect(block.style.getPropertyValue("border-radius")).toBe("");
	}
	expect(first.style.getPropertyValue("--x")).toBe("1px");
	expect(first.style.getPropertyValue("--y")).toBe("2px");
	expect(first.style.getPropertyValue("--w")).toBe("30px");
	expect(first.style.getPropertyValue("--h")).toBe("40px");
	expect(second.style.getPropertyValue("--x")).toBe("5px");
});

test("a square leaf leaves the radius to the stylesheet's default", () => {
	const { container } = render(() => (
		<Skeleton visible={true}>
			<p>Loading me</p>
		</Skeleton>
	));
	const [square, rounded] = blocks(container);
	expect(square.style.getPropertyValue("--r")).toBe("");
	expect(rounded.style.getPropertyValue("--r")).toBe("8px");
});
