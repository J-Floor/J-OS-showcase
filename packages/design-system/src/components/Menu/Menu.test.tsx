import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { Menu } from "./Menu.tsx";

afterEach(cleanup);

test("a closed menu builds no content before its first open", () => {
	render(() => (
		<Menu.Root>
			<Menu.Trigger>Actions</Menu.Trigger>
			<Menu.Content>
				<Menu.Item value="rename">Rename</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	));
	expect(screen.queryByText("Rename")).toBeNull();
});

test("classOverride restyles the positioner and the content", () => {
	render(() => (
		<Menu.Root defaultOpen>
			<Menu.Trigger>Actions</Menu.Trigger>
			<Menu.Content
				classOverride={{
					positionerClass: "my-positioner",
					contentClass: "my-content",
				}}
			>
				<Menu.Item value="rename">Rename</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	));
	expect(
		document.querySelector('[data-scope="menu"][data-part="positioner"]')
	).toHaveClass("my-positioner");
	expect(
		document.querySelector('[data-scope="menu"][data-part="content"]')
	).toHaveClass("my-content");
});

test("a caller's class is merged onto each part, not swapped for it", () => {
	render(() => (
		<Menu.Root defaultOpen>
			<Menu.Trigger>Actions</Menu.Trigger>
			<Menu.Content class="content">
				<Menu.ItemGroup class="group">
					<Menu.ItemGroupLabel class="label">
						File
					</Menu.ItemGroupLabel>
					<Menu.Item value="rename" class="item">
						Rename
					</Menu.Item>
				</Menu.ItemGroup>
				<Menu.Separator class="separator" />
			</Menu.Content>
		</Menu.Root>
	));
	for (const [part, name] of [
		["content", "content"],
		["item-group", "group"],
		["item-group-label", "label"],
		["item", "item"],
		["separator", "separator"],
	]) {
		const element = document.querySelector(
			`[data-scope="menu"][data-part="${part}"]`
		);
		expect(element).toHaveClass(name);
		// The part's own module class is still there next to the caller's.
		expect(element?.classList.length).toBeGreaterThan(1);
	}
});
