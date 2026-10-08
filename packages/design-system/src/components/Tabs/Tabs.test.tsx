import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

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
