import { render, screen } from "@solidjs/testing-library";

import { ExceptionDisplay } from "./ExceptionDisplay.tsx";

test("renders the icon ligature, title and description", () => {
	render(() => (
		<ExceptionDisplay
			status="error"
			icon="bolt"
			title="Boom"
			description="It broke."
		/>
	));
	expect(screen.getByRole("heading", { name: "Boom" })).toBeInTheDocument();
	expect(screen.getByText("bolt")).toBeInTheDocument();
	expect(screen.getByText("It broke.")).toBeInTheDocument();
});

test("applies the status to the Status wrapper", () => {
	render(() => (
		<ExceptionDisplay status="warning" icon="lock" title="Nope" />
	));
	expect(
		document.querySelector('[data-status="warning"]')
	).toBeInTheDocument();
});

test("renders action children", () => {
	render(() => (
		<ExceptionDisplay icon="inbox" title="Empty">
			<button type="button">Do thing</button>
		</ExceptionDisplay>
	));
	expect(
		screen.getByRole("button", { name: "Do thing" })
	).toBeInTheDocument();
});
