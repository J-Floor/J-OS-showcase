import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import { PropertyRow } from "./PropertyRow.tsx";

test("renders the label text", () => {
	render(() => (
		<PropertyRow icon="flag" label="Status">
			<span>value</span>
		</PropertyRow>
	));
	expect(screen.getByText("Status")).toBeInTheDocument();
});

test("renders children (value)", () => {
	render(() => (
		<PropertyRow icon="flag" label="Status">
			<span>VAL</span>
		</PropertyRow>
	));
	expect(screen.getByText("VAL")).toBeInTheDocument();
});

test("renders the icon glyph", () => {
	render(() => (
		<PropertyRow icon="flag" label="Status">
			<span>value</span>
		</PropertyRow>
	));
	// Icon renders a span[data-icon] containing the ligature name as text
	const iconEl = document.querySelector("[data-icon]");
	expect(iconEl).toBeInTheDocument();
	expect(iconEl?.textContent).toBe("flag");
});
