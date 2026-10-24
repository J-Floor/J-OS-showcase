import { Switch } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Switch",
	render: (p) => (
		<Switch
			label={p.label}
			description={p.description || undefined}
			defaultChecked={p.checked}
			disabled={p.disabled}
			disabledReason={p.disabledReason}
		/>
	),
	controls: {
		label: { type: "text", default: "Push notifications on this device" },
		description: {
			type: "text",
			default:
				"Off. Turn on to get notifications here as well as by email.",
		},
		checked: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
		disabledReason: {
			type: "text",
			default: "Allow notifications in the browser first.",
		},
	},
	presets: {
		On: { checked: true, description: "On." },
		"No description": { description: "" },
		Disabled: {
			disabled: true,
			description: "Push notifications aren't set up yet.",
		},
	},
} satisfies Demo;
