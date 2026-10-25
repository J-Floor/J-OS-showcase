import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HOVER_INTENT_MS } from "../../utils/hoverIntent.ts";
import { MORPH_OF, MORPH_TITLE } from "../../utils/morphNames.ts";
import { ENTITY_SURFACE } from "../../utils/morphPairing.ts";

import { Card } from "./Card.tsx";

afterEach(cleanup);

test("morphId makes the root an activatable entity surface", () => {
	render(() => <Card.Root id="root" morphId="p1" />);
	const root = document.getElementById("root");
	expect(root).toHaveAttribute(MORPH_OF, "p1");
	expect(root?.matches(ENTITY_SURFACE)).toBe(true);
});

test("a root without morphId is no entity surface", () => {
	render(() => <Card.Root id="root" />);
	expect(document.getElementById("root")).not.toHaveAttribute(MORPH_OF);
});

test("the title of a card with a morphId marks itself as the morph title", () => {
	render(() => (
		<Card.Root morphId="p1">
			<Card.Title>Opening hours</Card.Title>
		</Card.Root>
	));
	expect(screen.getByRole("heading")).toHaveAttribute(MORPH_TITLE);
});

test("the title of a card without a morphId carries no marker", () => {
	render(() => (
		<Card.Root>
			<Card.Title>Opening hours</Card.Title>
		</Card.Root>
	));
	expect(screen.getByRole("heading")).not.toHaveAttribute(MORPH_TITLE);
});

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

describe("onHoverIntent", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("fires once the pointer has rested on the card", () => {
		const spy = vi.fn();
		render(() => <Card.Root id="root" onHoverIntent={spy} />);
		const root = document.getElementById("root")!;
		fireEvent.pointerEnter(root);
		vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
		expect(spy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test("leaving early never fires", () => {
		const spy = vi.fn();
		render(() => <Card.Root id="root" onHoverIntent={spy} />);
		const root = document.getElementById("root")!;
		fireEvent.pointerEnter(root);
		vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
		fireEvent.pointerLeave(root);
		vi.advanceTimersByTime(HOVER_INTENT_MS * 10);
		expect(spy).not.toHaveBeenCalled();
	});

	test("reaches the element an asChild root renders", () => {
		const spy = vi.fn();
		render(() => (
			<Card.Root
				onHoverIntent={spy}
				asChild={(card) => <button {...card()} type="button" />}
			/>
		));
		fireEvent.pointerEnter(screen.getByRole("button"));
		vi.advanceTimersByTime(HOVER_INTENT_MS);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test("still runs the caller's own pointer handlers", () => {
		const enter = vi.fn();
		const leave = vi.fn();
		render(() => (
			<Card.Root
				id="root"
				onHoverIntent={() => {}}
				onPointerEnter={enter}
				onPointerLeave={leave}
			/>
		));
		const root = document.getElementById("root")!;
		fireEvent.pointerEnter(root);
		fireEvent.pointerLeave(root);
		expect(enter).toHaveBeenCalledTimes(1);
		expect(leave).toHaveBeenCalledTimes(1);
	});
});
