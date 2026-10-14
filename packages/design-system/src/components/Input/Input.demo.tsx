import { Input } from "@j-os/design-system";

import { FIELD_STATE_CONTROLS, type Demo } from "../../../demo/types.ts";

export default {
	title: "Input",
	render: (p) => (
		<Input
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			leadingIconName={p.leadingIconName || undefined}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
			readOnly={p.readOnly}
		/>
	),
	controls: {
		label: { type: "text", default: "Email" },
		placeholder: { type: "text", default: "you@example.com" },
		helperText: { type: "text", default: "We'll never share it." },
		errorText: { type: "text", default: "That email looks invalid." },
		leadingIconName: { type: "text", default: "mail" },
		...FIELD_STATE_CONTROLS,
	},
	presets: {
		Error: { invalid: true },
		Required: { required: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
