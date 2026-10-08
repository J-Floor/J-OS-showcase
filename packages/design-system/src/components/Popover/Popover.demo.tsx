import { Button, Popover } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Popover",
	render: (p) => (
		<Popover.Root>
			<Popover.ClickTrigger>
				<Button variant="secondary">{p.label}</Button>
			</Popover.ClickTrigger>
			<Popover.Content>
				<Popover.Title>{p.title}</Popover.Title>
				<Popover.Description>{p.description}</Popover.Description>
			</Popover.Content>
		</Popover.Root>
	),
	controls: {
		label: { type: "text", default: "Open popover" },
		title: { type: "text", default: "Popover title" },
		description: {
			type: "text",
			default: "Some descriptive content shown inside the popover.",
		},
	},
} satisfies Demo;
