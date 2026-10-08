import { render, screen, fireEvent } from "@solidjs/testing-library";

import { Popover } from "./Popover.tsx";

test("opens on trigger click", async () => {
	render(() => (
		<Popover.Root>
			<Popover.ClickTrigger>open</Popover.ClickTrigger>
			<Popover.Content>
				<Popover.Title>Title</Popover.Title>
			</Popover.Content>
		</Popover.Root>
	));
	fireEvent.click(screen.getByText("open"));
	expect(await screen.findByText("Title")).toBeInTheDocument();
});

test("closed popover content is not in the DOM", () => {
	render(() => (
		<Popover.Root>
			<Popover.ClickTrigger>open</Popover.ClickTrigger>
			<Popover.Content>Body text</Popover.Content>
		</Popover.Root>
	));
	expect(screen.queryByText("Body text")).toBeNull();
});
