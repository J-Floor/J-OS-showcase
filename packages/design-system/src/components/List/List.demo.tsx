import { List } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "List",
	render: (p) => (
		<List.Root>
			<List.Item onClick={p.clickable ? () => undefined : undefined}>
				{p.showIcons ? (
					<List.ItemLeftIcon>counter_1</List.ItemLeftIcon>
				) : null}
				<List.ItemTitle>Inbox</List.ItemTitle>
				<List.ItemDescription wrap={p.wrap}>
					3 new messages
				</List.ItemDescription>
			</List.Item>
			<List.Item onClick={p.clickable ? () => undefined : undefined}>
				{p.showIcons ? (
					<List.ItemLeftIcon>counter_2</List.ItemLeftIcon>
				) : null}
				<List.ItemTitle>Drafts</List.ItemTitle>
				<List.ItemDescription wrap={p.wrap}>
					1 saved draft
				</List.ItemDescription>
			</List.Item>
			<List.Item onClick={p.clickable ? () => undefined : undefined}>
				{p.showIcons ? (
					<List.ItemLeftIcon>counter_3</List.ItemLeftIcon>
				) : null}
				<List.ItemTitle>Archive</List.ItemTitle>
				<List.ItemDescription wrap={p.wrap}>
					All older items
				</List.ItemDescription>
			</List.Item>
		</List.Root>
	),
	controls: {
		showIcons: { type: "boolean", default: true },
		clickable: { type: "boolean", default: false },
		wrap: { type: "boolean", default: false },
	},
	presets: {
		"No icons": { showIcons: false },
		Clickable: { clickable: true },
	},
} satisfies Demo;
