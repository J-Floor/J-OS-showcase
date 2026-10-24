import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { TOOLTIP_OPEN_DELAY_MS } from "../Tooltip/Tooltip.tsx";

import { Accordion } from "./Accordion.tsx";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function Sections(props: { disabled?: boolean }) {
	return (
		<Accordion.Root defaultValue={["one"]}>
			<Accordion.Item value="one">
				<Accordion.ItemTitle>
					One
					<Accordion.ItemSubtitle>
						First section
					</Accordion.ItemSubtitle>
				</Accordion.ItemTitle>
				<Accordion.ItemContent>Body one</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item
				value="two"
				disabled={props.disabled}
				disabledReason="Not yet"
			>
				<Accordion.ItemTitle>Two</Accordion.ItemTitle>
				<Accordion.ItemContent>Body two</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}

function trigger(name: RegExp): HTMLElement {
	return screen.getByRole("button", { name });
}

/** zag's accordion acts on a click only once its trigger has focus, as in a
 *  browser, where the press focuses the button first. */
async function press(element: HTMLElement): Promise<void> {
	element.focus();
	fireEvent.click(element);
	await vi.advanceTimersByTimeAsync(0);
}

test("an open section collapses again by default (collapsible)", async () => {
	render(() => <Sections />);
	const one = trigger(/One/);
	expect(one).toHaveAttribute("aria-expanded", "true");
	await press(one);
	expect(one).toHaveAttribute("aria-expanded", "false");
});

test("disabled reaches the Ark item, so the section cannot expand", async () => {
	render(() => <Sections disabled />);
	const two = trigger(/Two/);
	expect(two).toBeDisabled();
	await press(two);
	expect(two).toHaveAttribute("aria-expanded", "false");
});

test("the tooltip says Collapse on an open section and Expand on a shut one", async () => {
	render(() => <Sections />);
	fireEvent.pointerMove(trigger(/One/));
	await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
	expect(screen.getByRole("tooltip")).toHaveTextContent("Collapse");
	await press(trigger(/One/));
	expect(screen.getByRole("tooltip")).toHaveTextContent("Expand");
});

test("a subtitle sits inside the trigger, under the title", () => {
	render(() => <Sections />);
	const subtitle = screen.getByText("First section");
	expect(trigger(/One/)).toContainElement(subtitle);
	expect(trigger(/One/)).toHaveAccessibleName(/One\s*First section/);
});

test("the trigger is not inside the clipping content box", () => {
	render(() => <Sections />);
	const content = screen.getByText("Body one");
	expect(content).not.toContainElement(trigger(/One/));
});

/** The top-level rule `selector` from the module's source. */
function rule(selector: string): string {
	const styles = readFileSync(
		`${import.meta.dirname}/Accordion.module.scss`,
		"utf8"
	);
	const start = styles.indexOf(`\n${selector} {`);
	return styles.slice(start, styles.indexOf("\n}\n", start));
}

test("the trigger's focus ring is not clipped by the item", () => {
	// The ring is inset, inside the trigger's own box, and the item does not
	// clip; only the content clips, for its slide animation.
	expect(rule(".item")).not.toContain("overflow");
	expect(rule(".itemTrigger")).toMatch(
		/&:focus-visible \{[^}]*outline-offset: calc\(-1 \*/
	);
	expect(rule(".itemContent")).toContain("overflow: hidden");
});

test("a title's other element children stay inline with its text; only the subtitle takes its own line", () => {
	// A flex column on the title stacked every element child, so a count
	// inside a title broke onto lines of its own.
	expect(rule(".itemTitle")).not.toMatch(/display|flex/);
	expect(rule(".itemSubtitle")).toContain("display: block;");
	render(() => (
		<Accordion.Root>
			<Accordion.Item value="one">
				<Accordion.ItemTitle>
					Items (<span>3</span>)
				</Accordion.ItemTitle>
				<Accordion.ItemContent>Body</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	));
	const count = screen.getByText("3");
	// The span sits directly in the title, next to its text: no wrapper.
	expect(count.parentElement?.textContent.replaceAll(/\s+/g, "")).toBe(
		"Items(3)"
	);
});
