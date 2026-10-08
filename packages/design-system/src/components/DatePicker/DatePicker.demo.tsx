import { createSignal } from "solid-js";

import { DatePicker } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function DatePickerDemo(props: {
	label: string;
	locale: string;
	disabled: boolean;
	readOnly: boolean;
}) {
	const [value, setValue] = createSignal<string | null>(null);
	return (
		<DatePicker
			label={props.label}
			locale={props.locale}
			value={value()}
			onValueChange={setValue}
			disabled={props.disabled}
			readOnly={props.readOnly}
		/>
	);
}

export default {
	title: "DatePicker",
	render: (p) => (
		<DatePickerDemo
			label={p.label}
			locale={p.locale}
			disabled={p.disabled}
			readOnly={p.readOnly}
		/>
	),
	controls: {
		label: { type: "text", default: "Due date" },
		locale: {
			type: "select",
			options: ["en-GB", "en-US"],
			default: "en-GB",
		},
		disabled: { type: "boolean", default: false },
		readOnly: { type: "boolean", default: false },
	},
	presets: {
		Disabled: { disabled: true },
		"US format": { locale: "en-US" },
	},
} satisfies Demo;
