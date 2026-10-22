import { Button, Tooltip } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Tooltip",
	render: (p) => (
		<>
			<Tooltip tooltipContent={p.tooltipContent} disabled={p.disabled}>
				<Button variant="secondary">{p.label}</Button>
			</Tooltip>
			<p>
				On touch screens, press and hold the trigger to show its
				tooltip. Releasing hides it again, and the hold does not click.
			</p>
		</>
	),
	controls: {
		label: { type: "text", default: "Hover me" },
		tooltipContent: { type: "text", default: "Helpful hint" },
		disabled: { type: "boolean", default: false },
	},
	presets: { Disabled: { disabled: true } },
} satisfies Demo;
