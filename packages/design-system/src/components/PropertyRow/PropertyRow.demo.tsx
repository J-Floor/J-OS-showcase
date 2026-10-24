import { Input, PropertyRow } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "PropertyRow",
	render: (p) => (
		<PropertyRow icon={p.icon} label={p.label}>
			<Input label={p.label} labelHidden placeholder={p.placeholder} />
		</PropertyRow>
	),
	controls: {
		icon: { type: "text", default: "label" },
		label: { type: "text", default: "Category" },
		placeholder: { type: "text", default: "Empty" },
	},
	presets: {
		"Due date": { icon: "calendar_month", label: "Due date" },
		Status: { icon: "flag", label: "Status" },
	},
} satisfies Demo;
