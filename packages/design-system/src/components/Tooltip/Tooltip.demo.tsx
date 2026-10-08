import { Button, Tooltip } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Tooltip",
	render: (p) => (
		<Tooltip tooltipContent={p.tooltipContent} disabled={p.disabled}>
			<Button variant="secondary">{p.label}</Button>
		</Tooltip>
	),
	controls: {
		label: { type: "text", default: "Hover me" },
		tooltipContent: { type: "text", default: "Helpful hint" },
		disabled: { type: "boolean", default: false },
	},
	presets: { Disabled: { disabled: true } },
} satisfies Demo;
