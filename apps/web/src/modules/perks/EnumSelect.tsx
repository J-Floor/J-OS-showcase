import { Select } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { LabelledOptions } from "../../shared/components/LabelledOptions.tsx";

/**
 * A single-value `Select` over a fixed set of labelled options (a perk's
 * category, a request's status). `value` is the current pick, or none for
 * the placeholder. `onChange` hears a newly picked value only: picking the
 * current one again sends nothing.
 */
export function EnumSelect<Value extends string>(props: {
	label: string;
	/** The label is for screen readers only: a property row names it. */
	labelHidden?: boolean;
	placeholder?: string;
	options: readonly { value: Value; label: string }[];
	value: Value | undefined;
	onChange: (value: Value) => void;
}): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden={props.labelHidden}
			placeholder={props.placeholder}
			value={props.value === undefined ? [] : [props.value]}
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				const picked = details.value[0] as Value | undefined;
				if (picked === undefined || picked === props.value) return;
				props.onChange(picked);
			}}
		>
			<LabelledOptions options={props.options} />
		</Select.Root>
	);
}
