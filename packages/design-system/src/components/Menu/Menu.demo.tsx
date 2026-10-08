import { Show } from "solid-js";

import { Button, Icon, Menu } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Menu",
	render: (p) => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<Button {...(triggerProps() as object)} variant="secondary">
						Actions<Icon>expand_more</Icon>
					</Button>
				)}
			/>
			<Menu.Content>
				<Show when={p.withGroupLabel}>
					<Menu.ItemGroupLabel>Manage</Menu.ItemGroupLabel>
				</Show>
				<Menu.Item value="edit">
					<Icon>edit</Icon>Edit
				</Menu.Item>
				<Menu.Item value="duplicate">
					<Icon>content_copy</Icon>Duplicate
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="delete">
					<Icon>delete</Icon>Delete
				</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	),
	controls: {
		withGroupLabel: { type: "boolean", default: true },
	},
} satisfies Demo;
