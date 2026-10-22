import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { afterEach, vi } from "vitest";

import {
	fakeViewTransitions,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";

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
