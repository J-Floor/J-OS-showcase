import { createSignal } from "solid-js";

import { TimePicker } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function TimePickerDemo(props: {
	label: string;
	disabled: boolean;
	required: boolean;
	minTime: string;
	maxTime: string;
}) {
	const [value, setValue] = createSignal<string | null>(null);
	return (
		<TimePicker
			label={props.label}
			value={value()}
			onValueChange={setValue}
			disabled={props.disabled}
			shamefullyOmitDisabledReason
			required={props.required}
			minTime={props.minTime || undefined}
			maxTime={props.maxTime || undefined}
		/>
	);
}

export default {
	title: "TimePicker",
	render: (p) => (
		<TimePickerDemo
			label={p.label}
			disabled={p.disabled}
			required={p.required}
			minTime={p.minTime}
			maxTime={p.maxTime}
		/>
	),
	controls: {
		label: { type: "text", default: "Start time" },
		disabled: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		minTime: { type: "text", default: "" },
		maxTime: { type: "text", default: "" },
	},
	presets: {
		Disabled: { disabled: true },
		"Business hours (09:00–18:00)": { minTime: "09:00", maxTime: "18:00" },
	},
} satisfies Demo;
