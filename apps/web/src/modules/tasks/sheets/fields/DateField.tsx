import { DatePicker } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { isoToMs, msToIso } from "../../data/taskHelpers.ts";

export function DateField(props: {
	label?: string;
	value?: number;
	onChange: (ms: number | undefined) => void;
}): JSX.Element {
	return (
		<DatePicker
			label={props.label}
			value={msToIso(props.value) ?? null}
			onValueChange={(iso) => {
				props.onChange(isoToMs(iso));
			}}
		/>
	);
}
