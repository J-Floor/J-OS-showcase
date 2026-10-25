import { DatePicker, type DatePickerProps } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { isoToMs, msToIso } from "../../data/taskHelpers.ts";

export function DateField(
	props: Pick<DatePickerProps, "label"> & {
		value?: number;
		onChange: (ms: number | undefined) => void;
	}
): JSX.Element {
	return (
		<DatePicker
			label={props.label}
			labelHidden
			value={msToIso(props.value) ?? null}
			onValueChange={(iso) => {
				props.onChange(isoToMs(iso));
			}}
		/>
	);
}
