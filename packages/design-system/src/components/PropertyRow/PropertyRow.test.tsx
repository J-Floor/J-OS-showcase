import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import { defineFields } from "../../utils/fields.ts";
import { MORPH_KEY } from "../../utils/morphPairing.ts";

import { PropertyRow } from "./PropertyRow.tsx";

const fields = defineFields({ status: { label: "Status", icon: "flag" } });

test("a field row shows the field's label and icon, and its value carries the field's key", () => {
	render(() => (
		<PropertyRow field={fields.status}>
			<span>VAL</span>
		</PropertyRow>
	));
	expect(screen.getByText("Status")).toBeInTheDocument();
	expect(document.querySelector("[data-icon]")?.textContent).toBe("flag");
	expect(screen.getByText("VAL").parentElement).toHaveAttribute(
		MORPH_KEY,
		"status"
	);
});

test("a row without a field never pairs: its value carries no key", () => {
	render(() => (
		<PropertyRow icon="flag" label="Status">
			<span>VAL</span>
		</PropertyRow>
	));
	expect(screen.getByText("VAL").parentElement).not.toHaveAttribute(
		MORPH_KEY
	);
});

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
	const iconElement = document.querySelector("[data-icon]");
	expect(iconElement).toBeInTheDocument();
	expect(iconElement?.textContent).toBe("flag");
});
