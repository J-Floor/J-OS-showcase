import { Combobox } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const items = [
	{ value: "solid", label: "Solid" },
	{ value: "react", label: "React" },
	{ value: "vue", label: "Vue" },
	{ value: "svelte", label: "Svelte" },
];

export default {
	title: "Combobox",
	render: (p) => (
		<Combobox.Root
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			allowClearing={p.allowClearing}
			sameWidth={p.sameWidth}
			multiple={p.multiple}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
			items={items}
		/>
	),
	controls: {
		label: { type: "text", default: "Framework" },
		placeholder: { type: "text", default: "Pick one" },
		helperText: { type: "text", default: "Type to filter, or pick one." },
		errorText: { type: "text", default: "Selection required." },
		allowClearing: { type: "boolean", default: true },
		sameWidth: { type: "boolean", default: true },
		multiple: { type: "boolean", default: false },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		Multiple: { multiple: true },
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
