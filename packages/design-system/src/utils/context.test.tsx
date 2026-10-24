import { render, screen } from "@solidjs/testing-library";
import { createContext } from "solid-js";
import { describe, expect, it } from "vitest";

import { useRequiredContext } from "./context.ts";

const WidgetContext = createContext<{ label: string }>();

function Part() {
	const state = useRequiredContext(
		WidgetContext,
		"Widget.Part",
		"Widget.Root"
	);
	return <span>{state.label}</span>;
}

describe("useRequiredContext", () => {
	it("returns the provided value", () => {
		render(() => (
			<WidgetContext.Provider value={{ label: "Inside" }}>
				<Part />
			</WidgetContext.Provider>
		));
		expect(screen.getByText("Inside")).toBeInTheDocument();
	});

	it("throws naming the part and its root when nothing provides it", () => {
		expect(() => render(() => <Part />)).toThrow(
			"Widget.Part must sit inside Widget.Root."
		);
	});
});
