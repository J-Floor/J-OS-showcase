import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { PermissionDenied } from "./PermissionDenied.tsx";

describe("PermissionDenied", () => {
	it("defaults to a neutral lock with an explanation", () => {
		const { container } = render(() => <PermissionDenied />);
		expect(
			screen.getByRole("heading", { name: "You don't have access" })
		).toBeInTheDocument();
		expect(
			screen.getByText("You don't have permission to view this.")
		).toBeInTheDocument();
		expect(container.querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"neutral"
		);
		expect(container.querySelector("[data-icon]")).toHaveTextContent(
			"lock"
		);
	});

	it("lets every default be overridden", () => {
		const { container } = render(() => (
			<PermissionDenied
				status="warning"
				icon="block"
				title="Admins only"
				description="Ask an admin for access."
			>
				<button type="button">Request access</button>
			</PermissionDenied>
		));
		expect(
			screen.getByRole("heading", { name: "Admins only" })
		).toBeInTheDocument();
		expect(
			screen.getByText("Ask an admin for access.")
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Request access" })
		).toBeInTheDocument();
		expect(container.querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"warning"
		);
		expect(container.querySelector("[data-icon]")).toHaveTextContent(
			"block"
		);
	});
});
