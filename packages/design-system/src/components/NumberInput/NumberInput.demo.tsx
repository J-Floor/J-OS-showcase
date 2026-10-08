import { NumberInput } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "NumberInput",
	render: (p) => (
		<NumberInput
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			leadingIconName={p.leadingIconName || undefined}
			min={p.min}
			max={p.max}
			step={p.step}
			onlyAllowTyping={p.onlyAllowTyping}
			allowClearing={p.allowClearing}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
		/>
	),
	controls: {
		label: { type: "text", default: "Quantity" },
		placeholder: { type: "text", default: "0" },
		helperText: { type: "text", default: "How many units?" },
		errorText: { type: "text", default: "Value out of range." },
		leadingIconName: { type: "text", default: "tag" },
		min: { type: "number", default: 0 },
		max: { type: "number", default: 100 },
		step: { type: "number", default: 1 },
		onlyAllowTyping: { type: "boolean", default: false },
		allowClearing: { type: "boolean", default: false },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		"Typing only": { onlyAllowTyping: true },
		Clearable: { allowClearing: true },
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
