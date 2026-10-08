import { Accordion } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

// Mirrors EmboUI's Accordion fixture: a few framework entries with subtitles,
// plus a disabled item to exercise MakeDisablable's reason tooltip.
export default {
	title: "Accordion",
	render: (p) => (
		<Accordion.Root multiple={p.multiple as boolean}>
			<Accordion.Item value="solid">
				<Accordion.ItemTitle
					subtitle={p.showSubtitles ? "Ryan Carniato" : undefined}
				>
					Solid
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					A declarative JavaScript library for building user
					interfaces with fine-grained reactivity.
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="react">
				<Accordion.ItemTitle
					subtitle={p.showSubtitles ? "Meta (Facebook)" : undefined}
				>
					React
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					A JavaScript library for building user interfaces with a
					component-based approach.
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item
				value="svelte"
				disabled
				disabledReason="Not in the demo set yet"
			>
				<Accordion.ItemTitle
					subtitle={p.showSubtitles ? "Rich Harris" : undefined}
				>
					Svelte (disabled)
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					Cybernetically enhanced web apps.
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	),
	controls: {
		multiple: { type: "boolean", default: false },
		showSubtitles: { type: "boolean", default: true },
	},
	presets: {
		"Allow multiple open": { multiple: true },
		"No subtitles": { showSubtitles: false },
	},
} satisfies Demo;
