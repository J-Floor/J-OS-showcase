import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState.tsx";

describe("EmptyState", () => {
	it("defaults to a neutral inbox and a generic heading", () => {
		const { container } = render(() => <EmptyState />);
		expect(
			screen.getByRole("heading", { name: "Nothing here yet" })
		).toBeInTheDocument();
		expect(container.querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"neutral"
		);
		expect(container.querySelector("[data-icon]")).toHaveTextContent(
			"inbox"
		);
	});

	it("lets every default be overridden", () => {
		const { container } = render(() => (
			<EmptyState
				status="info"
				icon="search_off"
				title="No matches"
				description="Try another search."
			>
				<button type="button">Clear filters</button>
			</EmptyState>
		));
		expect(
			screen.getByRole("heading", { name: "No matches" })
		).toBeInTheDocument();
		expect(screen.getByText("Try another search.")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Clear filters" })
		).toBeInTheDocument();
		expect(container.querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"info"
		);
		expect(container.querySelector("[data-icon]")).toHaveTextContent(
			"search_off"
		);
	});
});
