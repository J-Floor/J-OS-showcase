import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { ICONS } from "../../icons.ts";

import { Status, useStatusIcon } from "./Status.tsx";

function IconName() {
	const icon = useStatusIcon();
	return <span data-testid="icon">{icon()}</span>;
}

describe("Status", () => {
	it("defaults to neutral", () => {
		const { container } = render(() => (
			<Status>
				<IconName />
			</Status>
		));
		expect(container.firstElementChild).toHaveAttribute(
			"data-status",
			"neutral"
		);
	});

	it("hands each status its own icon", () => {
		render(() => (
			<Status status="error">
				<IconName />
			</Status>
		));
		expect(screen.getByTestId("icon")).toHaveTextContent(ICONS.error);
	});

	it("uses neutralIconName only while the status is neutral", () => {
		render(() => (
			<>
				<Status neutralIconName="star">
					<IconName />
				</Status>
				<Status status="success" neutralIconName="star">
					<IconName />
				</Status>
			</>
		));
		const [neutral, success] = screen.getAllByTestId("icon");
		expect(neutral).toHaveTextContent("star");
		expect(success).toHaveTextContent(ICONS.check);
	});

	it("useStatusIcon throws outside a Status", () => {
		expect(() => render(() => <IconName />)).toThrow(
			"useStatusIcon must be used within a <Status>"
		);
	});
});
