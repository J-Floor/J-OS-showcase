import { Checkbox } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Checkbox",
	render: (p) => (
		<Checkbox
			checked={
				p.state === "indeterminate"
					? "indeterminate"
					: p.state === "checked"
			}
			disabled={p.disabled}
			disabledReason={p.disabledReason || undefined}
			invalid={p.invalid}
			required={p.required}
			readOnly={p.readOnly}
		>
			{p.label}
		</Checkbox>
	),
	controls: {
		label: { type: "text", default: "Accept terms" },
		state: {
			type: "select",
			options: ["unchecked", "checked", "indeterminate"],
			default: "checked",
		},
		disabled: { type: "boolean", default: false },
		disabledReason: { type: "text", default: "You must sign in first." },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		readOnly: { type: "boolean", default: false },
	},
	presets: {
		Indeterminate: { state: "indeterminate" },
		Disabled: { disabled: true },
		Invalid: { invalid: true },
	},
} satisfies Demo;
