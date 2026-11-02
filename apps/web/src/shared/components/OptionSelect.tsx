import { Select } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { LabelledOptions } from "./LabelledOptions.tsx";

/** What a select can send: a picked value, or undefined too when it can be
 *  emptied. */
type OptionSelectChange<Value extends string> =
	| { clearable: true; onChange: (value: Value | undefined) => void }
	| { clearable?: false; onChange: (value: Value) => void };

/**
 * A single-value `Select` over a fixed set of labelled options. `value` is
 * the current pick, or none for the placeholder. `onChange` hears a newly
 * picked value only: picking the current one again sends nothing. Only a
 * `clearable` select can be emptied, and then `onChange` hears undefined.
 */
export function OptionSelect<Value extends string>(
	props: {
		label: string;
		/** The label is for screen readers only: a property row names it. */
		labelHidden?: boolean;
		placeholder?: string;
		options: readonly { value: Value; label: string }[];
		value: Value | undefined;
	} & OptionSelectChange<Value>
): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden={props.labelHidden}
			placeholder={props.placeholder}
			allowClearing={props.clearable}
			value={props.value === undefined ? [] : [props.value]}
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				const picked = details.value[0] as Value | undefined;
				if (picked === props.value) return;
				if (picked !== undefined) props.onChange(picked);
				else if (props.clearable) props.onChange(undefined);
			}}
		>
			<LabelledOptions options={props.options} />
		</Select.Root>
	);
}
