import { Select } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const options = [
	{ value: "solid", title: "Solid" },
	{ value: "react", title: "React" },
	{ value: "vue", title: "Vue" },
	{ value: "svelte", title: "Svelte" },
];

export default {
	title: "Select",
	render: (p) => (
		<Select.Root
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			allowClearing={p.allowClearing}
			sameWidth={p.sameWidth}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
			options={options}
		>
			<Select.Content>
				{options.map((option) => (
					<Select.Option value={option.value} title={option.title} />
				))}
			</Select.Content>
		</Select.Root>
	),
	controls: {
		label: { type: "text", default: "Framework" },
		placeholder: { type: "text", default: "Pick one" },
		helperText: { type: "text", default: "Choose your stack." },
		errorText: { type: "text", default: "Selection required." },
		allowClearing: { type: "boolean", default: true },
		sameWidth: { type: "boolean", default: true },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
