// @vitest-environment jsdom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

import { OWN_GESTURES_ATTR, ownsGesture } from "../../utils/swipe.ts";

import { SignaturePad } from "./SignaturePad.tsx";

test("renders the label and a clear control", () => {
	render(() => <SignaturePad label="Sign here" onChange={vi.fn()} />);
	expect(screen.getByText("Sign here")).toBeInTheDocument();
	// Clear control is a button (ark ClearTrigger renders a <button>).
	expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});

test("drawing is its own gesture, so a tab swipe never starts on the pad", () => {
	const { container } = render(() => (
		<SignaturePad label="Sign here" onChange={vi.fn()} />
	));
	const segment = container.querySelector('[data-part="segment"]');
	if (!segment) throw new Error("no drawing surface");
	expect(segment.closest(`[${OWN_GESTURES_ATTR}]`)).not.toBeNull();
	expect(ownsGesture(segment, container)).toBe(true);
});
