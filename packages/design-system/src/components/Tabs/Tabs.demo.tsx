import { Button, Icon, IconButton, Tabs } from "@j-os/design-system";
import { Show } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

/** Each tab declares its own actions inside its panel; the bar shows the
 *  active tab's. */
export default {
	title: "Tabs",
	render: (p) => (
		<Tabs.Root defaultValue="overview" orientation={p.orientation}>
			<Tabs.Bar>
				<Tabs.List>
					<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
					<Tabs.Trigger value="details">Details</Tabs.Trigger>
					<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Bar>
			<Tabs.Content value="overview">
				<Show when={p.actions}>
					<Tabs.Actions value="overview">
						<IconButton tooltipLabel="Print">print</IconButton>
						<Button>
							<Icon>add</Icon> New item
						</Button>
					</Tabs.Actions>
				</Show>
				Overview panel content.
			</Tabs.Content>
			<Tabs.Content value="details">
				<Show when={p.actions}>
					<Tabs.Actions value="details">
						<Button variant="secondary">Export</Button>
					</Tabs.Actions>
				</Show>
				Details panel content.
			</Tabs.Content>
			<Tabs.Content value="activity">
				Activity panel content (no actions).
			</Tabs.Content>
		</Tabs.Root>
	),
	controls: {
		orientation: {
			type: "select",
			options: ["horizontal", "vertical"],
			default: "horizontal",
		},
		actions: { type: "boolean", default: true },
	},
	presets: {
		Vertical: { orientation: "vertical", actions: false },
		"Without actions": { actions: false },
	},
} satisfies Demo;
