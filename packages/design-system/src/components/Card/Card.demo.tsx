import { Button, Card } from "@j-os/design-system";
import { Show } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Card",
	render: (p) => (
		<Card.Root>
			<Card.Header>
				<Card.Title>{p.title}</Card.Title>
				<Show when={p.description}>
					<Card.Description>{p.description}</Card.Description>
				</Show>
				<Show when={p.action}>
					<Card.Action>
						<Button variant="tertiary">Edit</Button>
					</Card.Action>
				</Show>
			</Card.Header>
			<Card.Body>{p.body}</Card.Body>
			<Show when={p.footer}>
				<Card.Footer>
					<Button variant="secondary">View all</Button>
				</Card.Footer>
			</Show>
		</Card.Root>
	),
	controls: {
		title: { type: "text", default: "Opening hours" },
		description: { type: "text", default: "Weekdays" },
		body: { type: "text", default: "9:00 to 18:00" },
		action: { type: "boolean", default: true },
		footer: { type: "boolean", default: false },
	},
	presets: {
		"Title only": { description: "", action: false, footer: false },
		Full: { action: true, footer: true },
	},
} satisfies Demo;
