import { Tabs } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Tabs",
	render: (p) => (
		<Tabs.Root defaultValue="overview" orientation={p.orientation}>
			<Tabs.List>
				<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
				<Tabs.Trigger value="details">Details</Tabs.Trigger>
				<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="overview">
				Overview panel content.
			</Tabs.Content>
			<Tabs.Content value="details">Details panel content.</Tabs.Content>
			<Tabs.Content value="activity">
				Activity panel content.
			</Tabs.Content>
		</Tabs.Root>
	),
	controls: {
		orientation: {
			type: "select",
			options: ["horizontal", "vertical"],
			default: "horizontal",
		},
	},
	presets: { Vertical: { orientation: "vertical" } },
} satisfies Demo;
