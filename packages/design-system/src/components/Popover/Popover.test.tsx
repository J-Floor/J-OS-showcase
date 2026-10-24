import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { Popover } from "./Popover.tsx";

afterEach(cleanup);

test("closed popover content is not in the DOM", () => {
	render(() => (
		<Popover.Root>
			<Popover.ClickTrigger>open</Popover.ClickTrigger>
			<Popover.Content>Body text</Popover.Content>
		</Popover.Root>
	));
	expect(screen.queryByText("Body text")).toBeNull();
});

test("classOverride restyles the positioner and the content", () => {
	render(() => (
		<Popover.Root defaultOpen>
			<Popover.ClickTrigger>open</Popover.ClickTrigger>
			<Popover.Content
				class="caller"
				classOverride={{
					positionerClass: "my-positioner",
					contentClass: "my-content",
				}}
			>
				Body text
			</Popover.Content>
		</Popover.Root>
	));
	expect(
		document.querySelector('[data-scope="popover"][data-part="positioner"]')
	).toHaveClass("my-positioner");
	expect(
		document.querySelector('[data-scope="popover"][data-part="content"]')
	).toHaveClass("my-content", "caller");
});
