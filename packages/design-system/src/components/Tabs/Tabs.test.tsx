import { readFileSync } from "node:fs";

import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, vi } from "vitest";

import {
	fakeViewTransitions,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { OWN_GESTURES_ATTR } from "../../utils/swipe.ts";

import { Tabs } from "./Tabs.tsx";

test("switches panel on tab click", async () => {
	render(() => (
		<Tabs.Root defaultValue="a">
			<Tabs.List>
				<Tabs.Trigger value="a">A</Tabs.Trigger>
				<Tabs.Trigger value="b">B</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="a">PanelA</Tabs.Content>
			<Tabs.Content value="b">PanelB</Tabs.Content>
		</Tabs.Root>
	));
	fireEvent.click(screen.getByText("B"));
	await waitFor(() => {
		expect(screen.getByText("PanelB")).toBeVisible();
	});
});

test("Actions render only for the active tab", async () => {
	render(() => (
		<Tabs.Root defaultValue="a">
			<Tabs.List>
				<Tabs.Trigger value="a">A</Tabs.Trigger>
				<Tabs.Trigger value="b">B</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Actions value="a">ActionsA</Tabs.Actions>
			<Tabs.Actions value="b">ActionsB</Tabs.Actions>
		</Tabs.Root>
	));
	expect(screen.getByText("ActionsA")).toBeInTheDocument();
	expect(screen.queryByText("ActionsB")).not.toBeInTheDocument();
	fireEvent.click(screen.getByText("B"));
	await waitFor(() => {
		expect(screen.getByText("ActionsB")).toBeInTheDocument();
	});
	expect(screen.queryByText("ActionsA")).not.toBeInTheDocument();
});

afterEach(async () => {
	// A transition keeps absorbing updates until its settle cap passes; let it
	// end so the next test starts its own.
	await transitionSettled();
	restoreViewTransitions();
});

/** data-vt as each transition starts. */
function fakeTransition(): string[] {
	const kinds: string[] = [];
	fakeViewTransitions({
		sync: true,
		onStart: () => kinds.push(document.documentElement.dataset.vt ?? ""),
	});
	return kinds;
}

function threeTabs(initial: string) {
	render(() => (
		<Tabs.Root defaultValue={initial}>
			<Tabs.List>
				<Tabs.Trigger value="a">A</Tabs.Trigger>
				<Tabs.Trigger value="b">B</Tabs.Trigger>
				<Tabs.Trigger value="c">C</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="a">PanelA</Tabs.Content>
			<Tabs.Content value="b">PanelB</Tabs.Content>
			<Tabs.Content value="c">PanelC</Tabs.Content>
		</Tabs.Root>
	));
}

test("a later tab slides forward", async () => {
	const kinds = fakeTransition();
	threeTabs("a");
	fireEvent.click(screen.getByText("C"));
	await waitFor(() => {
		expect(screen.getByText("PanelC")).toBeVisible();
	});
	expect(kinds).toEqual(["tab-forward"]);
});

test("an earlier tab slides back", async () => {
	const kinds = fakeTransition();
	threeTabs("c");
	fireEvent.click(screen.getByText("A"));
	await waitFor(() => {
		expect(screen.getByText("PanelA")).toBeVisible();
	});
	expect(kinds).toEqual(["tab-back"]);
});

test("onValueChange still fires and urlParam still writes", async () => {
	const set = vi.fn();
	const onValueChange = vi.fn();
	render(() => (
		<Tabs.Root
			urlParam={{ get: () => "a", set, fallback: "a" }}
			onValueChange={onValueChange}
		>
			<Tabs.List>
				<Tabs.Trigger value="a">A</Tabs.Trigger>
				<Tabs.Trigger value="b">B</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	));
	fireEvent.click(screen.getByText("B"));
	await waitFor(() => {
		expect(set).toHaveBeenCalledWith("b");
	});
	expect(onValueChange).toHaveBeenCalledWith(
		expect.objectContaining({ value: "b" })
	);
});

test("nested tabs: the outer switch uses the outer order and names the outer panel", async () => {
	const kinds = fakeTransition();
	render(() => (
		<Tabs.Root defaultValue="a">
			<Tabs.List>
				<Tabs.Trigger value="a">OuterA</Tabs.Trigger>
				<Tabs.Trigger value="b">OuterB</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="a">
				<Tabs.Root defaultValue="x">
					<Tabs.List>
						<Tabs.Trigger value="y">InnerY</Tabs.Trigger>
						<Tabs.Trigger value="x">InnerX</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="x">PanelX</Tabs.Content>
					<Tabs.Content value="y">PanelY</Tabs.Content>
				</Tabs.Root>
			</Tabs.Content>
			<Tabs.Content value="b">PanelB</Tabs.Content>
		</Tabs.Root>
	));
	fireEvent.click(screen.getByText("OuterB"));
	await waitFor(() => {
		expect(screen.getByText("PanelB")).toBeVisible();
	});
	expect(kinds).toEqual(["tab-forward"]);
	expect(
		document.querySelectorAll('[style*="jf-tab"]').length
	).toBeLessThanOrEqual(1);
});

function barWithActions(initial: string) {
	render(() => (
		<Tabs.Root defaultValue={initial}>
			<Tabs.Bar data-testid="bar">
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b">B</Tabs.Trigger>
					<Tabs.Trigger value="c">C</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Actions value="a">
					<button type="button">ActionA</button>
				</Tabs.Actions>
				<Tabs.Actions value="b">
					<button type="button">ActionB</button>
				</Tabs.Actions>
			</Tabs.Bar>
		</Tabs.Root>
	));
}

function actionParts(): NodeListOf<Element> {
	return screen
		.getByTestId("bar")
		.querySelectorAll('[data-part="tab-actions"]');
}

test("Bar holds the list and the active tab's actions once, in one actions part", () => {
	barWithActions("a");
	const bar = screen.getByTestId("bar");
	expect(bar).toHaveAttribute("data-part", "tab-bar");
	expect(bar).toContainElement(screen.getByRole("tablist"));
	expect(actionParts()).toHaveLength(1);
	expect(actionParts()[0]).toContainElement(screen.getByText("ActionA"));
	expect(screen.getAllByText("ActionA")).toHaveLength(1);
});

test("no actions part while the active tab has no actions", async () => {
	barWithActions("a");
	fireEvent.click(screen.getByText("C"));
	await waitFor(() => {
		expect(actionParts()).toHaveLength(0);
	});
});

test("Actions without a value show on every tab", async () => {
	render(() => (
		<Tabs.Root defaultValue="a">
			<Tabs.Bar>
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b">B</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Actions>Always</Tabs.Actions>
			</Tabs.Bar>
		</Tabs.Root>
	));
	expect(screen.getByText("Always")).toBeInTheDocument();
	fireEvent.click(screen.getByText("B"));
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute(
			"data-selected"
		);
	});
	expect(screen.getByText("Always")).toBeInTheDocument();
});

test("Bar scrolls the active trigger into view, and again when it changes", async () => {
	const scrolled: string[] = [];
	Element.prototype.scrollIntoView = function record(this: Element) {
		scrolled.push(this.textContent);
	};
	try {
		barWithActions("a");
		await waitFor(() => {
			expect(scrolled).toEqual(["A"]);
		});
		fireEvent.click(screen.getByText("C"));
		await waitFor(() => {
			expect(scrolled).toEqual(["A", "C"]);
		});
	} finally {
		delete (Element.prototype as { scrollIntoView?: unknown })
			.scrollIntoView;
	}
});

function pointer(
	type: string,
	target: Element,
	x: number,
	pointerType = "touch"
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			pointerId: 1,
			pointerType,
			isPrimary: true,
			clientX: x,
			clientY: 100,
		})
	);
}

/** A finger moving 120px left (to the next tab) or right (back). */
function swipe(
	target: Element,
	way: "left" | "right",
	pointerType = "touch"
): void {
	pointer("pointerdown", target, 200, pointerType);
	pointer("pointerup", target, way === "left" ? 80 : 320, pointerType);
}

describe("swipe", () => {
	test("a swipe left on a panel moves to the next tab, sliding forward", async () => {
		const kinds = fakeTransition();
		threeTabs("a");
		swipe(screen.getByText("PanelA"), "left");
		await waitFor(() => {
			expect(screen.getByText("PanelB")).toBeVisible();
		});
		expect(kinds).toEqual(["tab-forward"]);
	});

	test("a swipe right moves to the previous tab, sliding back", async () => {
		const kinds = fakeTransition();
		threeTabs("b");
		swipe(screen.getByText("PanelB"), "right");
		await waitFor(() => {
			expect(screen.getByText("PanelA")).toBeVisible();
		});
		expect(kinds).toEqual(["tab-back"]);
	});

	test("does nothing past the first or the last tab", () => {
		const onValueChange = vi.fn();
		render(() => (
			<Tabs.Root defaultValue="a" onValueChange={onValueChange}>
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b">B</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="a">PanelA</Tabs.Content>
				<Tabs.Content value="b">PanelB</Tabs.Content>
			</Tabs.Root>
		));
		swipe(screen.getByText("PanelA"), "right");
		expect(onValueChange).not.toHaveBeenCalled();
	});

	test("goes through the change path: urlParam writes, onValueChange fires", async () => {
		const set = vi.fn();
		const onValueChange = vi.fn();
		render(() => (
			<Tabs.Root
				urlParam={{ get: () => "b", set, fallback: "a" }}
				onValueChange={onValueChange}
			>
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b">B</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="a">PanelA</Tabs.Content>
				<Tabs.Content value="b">PanelB</Tabs.Content>
			</Tabs.Root>
		));
		swipe(screen.getByText("PanelB"), "right");
		await waitFor(() => {
			expect(set).toHaveBeenCalledWith("a");
		});
		expect(onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ value: "a" })
		);
	});

	test("skips a disabled tab", async () => {
		render(() => (
			<Tabs.Root defaultValue="a">
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b" disabled>
						B
					</Tabs.Trigger>
					<Tabs.Trigger value="c">C</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="a">PanelA</Tabs.Content>
				<Tabs.Content value="b">PanelB</Tabs.Content>
				<Tabs.Content value="c">PanelC</Tabs.Content>
			</Tabs.Root>
		));
		swipe(screen.getByText("PanelA"), "left");
		await waitFor(() => {
			expect(screen.getByText("PanelC")).toBeVisible();
		});
	});

	test("a mouse drag, a swipe on the tab bar or on content with its own drags does nothing", () => {
		const onValueChange = vi.fn();
		render(() => (
			<Tabs.Root defaultValue="a" onValueChange={onValueChange}>
				<Tabs.List>
					<Tabs.Trigger value="a">A</Tabs.Trigger>
					<Tabs.Trigger value="b">B</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="a">
					PanelA
					<div {...{ [OWN_GESTURES_ATTR]: "" }}>Card</div>
				</Tabs.Content>
				<Tabs.Content value="b">PanelB</Tabs.Content>
			</Tabs.Root>
		));
		swipe(screen.getByText("Card"), "left");
		swipe(screen.getByRole("tablist"), "left");
		swipe(screen.getByText("PanelA"), "left", "mouse");
		expect(onValueChange).not.toHaveBeenCalled();
	});

	test("a swipe inside a nested tabs moves the inner tabs only", async () => {
		const outer = vi.fn();
		render(() => (
			<Tabs.Root defaultValue="a" onValueChange={outer}>
				<Tabs.List>
					<Tabs.Trigger value="a">OuterA</Tabs.Trigger>
					<Tabs.Trigger value="b">OuterB</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="a">
					<Tabs.Root defaultValue="x">
						<Tabs.List>
							<Tabs.Trigger value="x">InnerX</Tabs.Trigger>
							<Tabs.Trigger value="y">InnerY</Tabs.Trigger>
						</Tabs.List>
						<Tabs.Content value="x">PanelX</Tabs.Content>
						<Tabs.Content value="y">PanelY</Tabs.Content>
					</Tabs.Root>
				</Tabs.Content>
				<Tabs.Content value="b">PanelB</Tabs.Content>
			</Tabs.Root>
		));
		swipe(screen.getByText("PanelX"), "left");
		await waitFor(() => {
			expect(screen.getByText("PanelY")).toBeVisible();
		});
		expect(outer).not.toHaveBeenCalled();
	});
});

describe("stylesheet", () => {
	const scss = readFileSync(
		`${import.meta.dirname}/Tabs.module.scss`,
		"utf8"
	);

	test("the bar never shrinks inside a bounded flex column", () => {
		// A phone bar clips overflow, which drops its automatic minimum height
		// to 0; in Space's bounded console that collapsed it to 0px.
		expect(scss).toMatch(/\.bar\s*\{[^}]*flex-shrink: 0;/);
	});

	test("a panel leaves room at its end for the floating toolbar", () => {
		// The pill floats over the page; a panel the page scrolls through
		// ends far enough below its last row for that row to clear it.
		expect(scss).toMatch(
			/\.content\s*\{[^}]*padding-block: var\(--jf-spacing-far\) var\(--jf-floating-toolbar-offset\);/
		);
	});

	test("a panel leaves sideways pans to the swipe, keeping scroll and zoom", () => {
		// Left to the browser, a sideways pan ends in pointercancel before it
		// is long enough to be a swipe.
		expect(scss).toMatch(
			/\.content\s*\{[^}]*touch-action: pan-y pinch-zoom;/
		);
	});
});
