import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import {
	FloatingStack,
	FloatingStackProvider,
} from "../FloatingStack/FloatingStack.tsx";

import { FloatingToolbar } from "./FloatingToolbar.tsx";

/** A viewport that is a phone, or not. */
function viewport(isPhone: boolean): void {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: isPhone && query.includes("40rem"),
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

test("renders its controls once, in one toolbar part", () => {
	render(() => (
		<FloatingToolbar data-testid="toolbar" class="extra">
			<button type="button">New</button>
		</FloatingToolbar>
	));
	const toolbar = screen.getByTestId("toolbar");
	expect(toolbar).toHaveAttribute("data-part", "floating-toolbar");
	expect(toolbar).toHaveClass("extra");
	expect(toolbar).toContainElement(screen.getByRole("button"));
	expect(screen.getAllByRole("button")).toHaveLength(1);
});

test("a caller can name the part (Tabs.Actions does)", () => {
	render(() => (
		<FloatingToolbar data-testid="toolbar" data-part="tab-actions">
			x
		</FloatingToolbar>
	));
	expect(screen.getByTestId("toolbar")).toHaveAttribute(
		"data-part",
		"tab-actions"
	);
});

/** A stack holding a pill, and a page placing its toolbar elsewhere. */
function renderPage() {
	render(() => (
		<>
			<main data-testid="page">
				<FloatingToolbar data-testid="toolbar">x</FloatingToolbar>
			</main>
			<p>stacked pill</p>
		</>
	));
}

/** An app shell: the page, and the stack beside it (not around it). */
function renderShell() {
	render(() => (
		<FloatingStackProvider>
			<main data-testid="page">
				<FloatingToolbar data-testid="toolbar">x</FloatingToolbar>
			</main>
			<FloatingStack>
				<p>stacked pill</p>
			</FloatingStack>
		</FloatingStackProvider>
	));
}

test("on a phone it joins the stack beside its page, as the last pill", () => {
	viewport(true);
	renderShell();
	const toolbar = screen.getByTestId("toolbar");
	const stack = document.querySelector('[data-part="floating-stack"]');
	expect(screen.getByTestId("page")).not.toContainElement(toolbar);
	expect(stack?.lastElementChild).toContainElement(toolbar);
	expect(stack?.firstElementChild).toHaveTextContent("stacked pill");
	expect(toolbar).toHaveAttribute("data-floating");
});

test("on a wide screen it stays where the page placed it", () => {
	viewport(false);
	renderShell();
	const toolbar = screen.getByTestId("toolbar");
	expect(screen.getByTestId("page")).toContainElement(toolbar);
	expect(toolbar).not.toHaveAttribute("data-floating");
});

test("without a stack it stays where the page placed it, on a phone too", () => {
	viewport(true);
	renderPage();
	const toolbar = screen.getByTestId("toolbar");
	expect(screen.getByTestId("page")).toContainElement(toolbar);
	expect(toolbar).not.toHaveAttribute("data-floating");
});
