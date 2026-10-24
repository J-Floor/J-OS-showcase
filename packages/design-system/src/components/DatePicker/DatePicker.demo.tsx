import { createSignal } from "solid-js";

import { DatePicker } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function DatePickerDemo(props: {
	label: string;
	locale: string;
	helperText: string;
	errorText: string;
	invalid: boolean;
	required: boolean;
	disabled: boolean;
	readOnly: boolean;
}) {
	const [value, setValue] = createSignal<string | null>(null);
	return (
		<DatePicker
			label={props.label}
			locale={props.locale}
			helperText={props.helperText}
			errorText={props.errorText}
			invalid={props.invalid}
			required={props.required}
			value={value()}
			onValueChange={setValue}
			disabled={props.disabled}
			disabledReason="Not editable right now"
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
			helperText={p.helperText}
			errorText={p.errorText}
			invalid={p.invalid}
			required={p.required}
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
		helperText: { type: "text", default: "The day it is due." },
		errorText: { type: "text", default: "Pick a date." },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
		readOnly: { type: "boolean", default: false },
	},
	presets: {
		Error: { invalid: true },
		Disabled: { disabled: true },
		"US format": { locale: "en-US" },
	},
} satisfies Demo;
