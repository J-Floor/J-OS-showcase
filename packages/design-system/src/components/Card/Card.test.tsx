import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { Card } from "./Card.tsx";

afterEach(cleanup);

function FullCard() {
	return (
		<Card.Root id="root" class="mine">
			<Card.Header id="header">
				<Card.Title>Opening hours</Card.Title>
				<Card.Description id="description">Mon–Fri</Card.Description>
				<Card.Action id="action">
					<button>Edit</button>
				</Card.Action>
			</Card.Header>
			<Card.Body id="body">9:00–18:00</Card.Body>
			<Card.Footer id="footer">Updated today</Card.Footer>
		</Card.Root>
	);
}

test("keeps a caller's class alongside its own", () => {
	render(() => <FullCard />);
	const root = document.getElementById("root");
	expect(root).toHaveClass("mine");
	expect(root?.classList.length).toBeGreaterThan(1);
});

test("the title is a heading", () => {
	render(() => <FullCard />);
	expect(
		screen.getByRole("heading", { name: "Opening hours" })
	).toBeInTheDocument();
});

test("marks each part so a consumer can find it", () => {
	render(() => <FullCard />);
	for (const part of [
		"root",
		"header",
		"description",
		"action",
		"body",
		"footer",
	]) {
		expect(
			document.querySelector(`[data-scope="card"][data-part="${part}"]`)
		).toBe(document.getElementById(part));
	}
	expect(
		document.querySelector('[data-scope="card"][data-part="title"]')
	).toBe(screen.getByRole("heading"));
});

test("the title takes another heading level through asChild", () => {
	render(() => (
		<Card.Root>
			<Card.Title asChild={(props) => <h2 {...props()} />}>
				Opening hours
			</Card.Title>
		</Card.Root>
	));
	expect(
		document.querySelector('[data-scope="card"][data-part="title"]')
	).toBe(screen.getByRole("heading", { level: 2, name: "Opening hours" }));
});
