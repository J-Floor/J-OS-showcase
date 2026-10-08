import { createSignal } from "solid-js";

import { TextArea } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function TextAreaDemo(props: {
	label: string;
	placeholder: string;
	helperText: string;
	errorText: string;
	invalid: boolean;
	required: boolean;
	disabled: boolean;
	readOnly: boolean;
}) {
	const [value, setValue] = createSignal("");
	return (
		<TextArea
			label={props.label}
			placeholder={props.placeholder}
			helperText={props.helperText}
			errorText={props.errorText}
			invalid={props.invalid}
			required={props.required}
			disabled={props.disabled}
			disabledReason="Not editable right now"
			readOnly={props.readOnly}
			value={value()}
			onInput={setValue}
		/>
	);
}

export default {
	title: "TextArea",
	render: (p) => (
		<TextAreaDemo
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
			readOnly={p.readOnly}
		/>
	),
	controls: {
		label: { type: "text", default: "Notes" },
		placeholder: { type: "text", default: "Add a description…" },
		helperText: { type: "text", default: "Markdown is supported." },
		errorText: { type: "text", default: "This field is required." },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
		readOnly: { type: "boolean", default: false },
	},
	presets: {
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
