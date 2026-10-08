import { Button, EmptyState, Icon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "EmptyState",
	render: (p) => (
		<EmptyState icon={p.icon} title={p.title} description={p.description}>
			{p.showAction ? (
				<Button>
					<Icon>add</Icon>Create one
				</Button>
			) : undefined}
		</EmptyState>
	),
	controls: {
		icon: { type: "text", default: "inbox" },
		title: { type: "text", default: "Nothing here yet" },
		description: {
			type: "text",
			default: "Get started by creating your first item.",
		},
		showAction: { type: "boolean", default: true },
	},
	presets: {
		"No results": {
			icon: "search_off",
			title: "No results",
			description: "Try a different search.",
			showAction: false,
		},
	},
} satisfies Demo;
