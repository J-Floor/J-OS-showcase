import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { Skeleton } from "./Skeleton.tsx";

afterEach(cleanup);

test("controlled visible=false renders the children", () => {
	const { container } = render(() => (
		<Skeleton visible={false}>
			<p>Real content</p>
		</Skeleton>
	));
	expect(screen.getByText("Real content")).toBeInTheDocument();
	expect(container.querySelector("[data-shimmer-container]")).toBeNull();
});

test("controlled visible=true still renders children content (jsdom no-layout fallback)", () => {
	// jsdom measures 0 leaves, so the shimmer falls back to plain children —
	// the content is present either way; geometry is browser-verified.
	const { container } = render(() => (
		<Skeleton visible={true}>
			<p>Loading me</p>
		</Skeleton>
	));
	expect(screen.getByText("Loading me")).toBeInTheDocument();
	const shimmerContainer = container.querySelector(
		"[data-shimmer-container]"
	);
	expect(shimmerContainer).not.toBeNull();
	const measureEl = shimmerContainer?.querySelector("[aria-hidden='true']");
	expect(measureEl).not.toBeNull();
	expect(measureEl).toContainElement(screen.getByText("Loading me"));
});

test("manual mode renders one bar sized by a width preset", () => {
	const { container } = render(() => <Skeleton width="short" />);
	const bar = container.firstElementChild;
	expect(bar?.getAttribute("data-width")).toBe("short");
	expect(bar?.getAttribute("aria-hidden")).toBe("true");
	expect(container.querySelector("[data-shimmer-container]")).toBeNull();
});

test("manual mode defaults to the medium preset", () => {
	const { container } = render(() => <Skeleton />);
	expect(container.firstElementChild?.getAttribute("data-width")).toBe(
		"medium"
	);
});

test("manual mode with a class drops the preset, so the class sizes it", () => {
	const { container } = render(() => <Skeleton class="custom" />);
	const bar = container.firstElementChild;
	expect(bar?.classList.contains("custom")).toBe(true);
	expect(bar?.hasAttribute("data-width")).toBe(false);
});
