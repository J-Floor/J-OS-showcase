import { Field } from "@ark-ui/solid/field";

import { MakeField } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "MakeField",
	render: (p) => (
		<MakeField
			label={p.label}
			labelHidden={p.labelHidden}
			helperText={p.helperText}
			errorText={p.errorText}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
			disabledReason="Not editable right now"
		>
			<Field.Input placeholder="A bare control inside the field" />
		</MakeField>
	),
	controls: {
		label: { type: "text", default: "Name" },
		labelHidden: { type: "boolean", default: false },
		helperText: {
			type: "text",
			default: "Shown while the field is valid.",
		},
		errorText: { type: "text", default: "Shown while it is invalid." },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		"Hidden label": { labelHidden: true },
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
