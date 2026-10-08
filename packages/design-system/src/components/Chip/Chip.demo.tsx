import { Chip, Icon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Chip",
	render: (p) => (
		<Chip>
			{p.label}
			<Icon>close</Icon>
		</Chip>
	),
	controls: {
		label: { type: "text", default: "Fintech" },
	},
	presets: {
		Healthcare: { label: "Healthcare" },
		SaaS: { label: "SaaS" },
	},
} satisfies Demo;
