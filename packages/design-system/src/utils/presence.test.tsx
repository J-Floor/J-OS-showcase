import { render, screen } from "@solidjs/testing-library";
import { createSignal, Show, type JSX } from "solid-js";
import { describe, expect, it } from "vitest";

import { createPresence, createSlotPart } from "./presence.tsx";

const part = createSlotPart("Widget", "Empty", "Widget");

/** A component with an `.Empty` slot part: its children may declare one, and the
 *  empty slot sits somewhere else in its tree. */
function Widget(props: { isEmpty: boolean; children?: JSX.Element }) {
	return (
		<part.Scope>
			{props.children}
			<Show when={props.isEmpty}>
				<section data-testid="slot">
					<part.Slot fallback="Default" />
				</section>
			</Show>
		</part.Scope>
	);
}

describe("createSlotPart", () => {
	it("shows the fallback without an Empty part", () => {
		render(() => <Widget isEmpty />);
		expect(screen.getByTestId("slot")).toHaveTextContent("Default");
	});

	it("shows an Empty part's children in the slot, not where it is placed", () => {
		render(() => (
			<Widget isEmpty>
				<part.Part>Custom</part.Part>
			</Widget>
		));
		expect(screen.getByTestId("slot")).toHaveTextContent("Custom");
		expect(screen.getByTestId("slot")).not.toHaveTextContent("Default");
		expect(screen.getAllByText("Custom")).toHaveLength(1);
	});

	it("falls back again once the Empty part goes away", () => {
		const [hasPart, setHasPart] = createSignal(true);
		render(() => (
			<Widget isEmpty>
				<Show when={hasPart()}>
					<part.Part>Custom</part.Part>
				</Show>
			</Widget>
		));
		setHasPart(false);
		expect(screen.getByTestId("slot")).toHaveTextContent("Default");
	});

	it("throws when the Empty part sits outside its component", () => {
		expect(() => render(() => <part.Part>Custom</part.Part>)).toThrow(
			"Widget.Empty must sit inside Widget."
		);
	});

	it("names the root it must sit inside", () => {
		const rooted = createSlotPart("Widget", "Skeleton", "Widget.Root");
		expect(() => render(() => <rooted.Part>Custom</rooted.Part>)).toThrow(
			"Widget.Skeleton must sit inside Widget.Root."
		);
	});

	it("hands a part's children to the slot's own wrapper", () => {
		render(() => (
			<part.Scope>
				<part.Part>Custom</part.Part>
				<section data-testid="slot">
					<part.Slot fallback="Default">
						{(content) => <em data-testid="wrapped">{content}</em>}
					</part.Slot>
				</section>
			</part.Scope>
		));
		expect(screen.getByTestId("wrapped")).toHaveTextContent("Custom");
	});

	it("a unique part throws on a second one in development", () => {
		const unique = createSlotPart("Widget", "Skeleton", "Widget", {
			unique: true,
		});
		expect(() =>
			render(() => (
				<unique.Scope>
					<unique.Part>One</unique.Part>
					<unique.Part>Two</unique.Part>
				</unique.Scope>
			))
		).toThrow("A Widget takes one Widget.Skeleton.");
	});
});

describe("createPresence", () => {
	it("is true while at least one registrant is alive", () => {
		const [present, register] = createPresence();
		const [shown, setShown] = createSignal(true);
		function Registrant() {
			register();
			return null;
		}
		render(() => (
			<Show when={shown()}>
				<Registrant />
			</Show>
		));
		expect(present()).toBe(true);
		setShown(false);
		expect(present()).toBe(false);
	});
});
