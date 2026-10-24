import { Select } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

/** One `Select.Option` per `{ value, label }` record, for a select whose
 *  options come from a list. */
export function LabelledOptions(props: {
	options: readonly { value: string; label: string }[];
}): JSX.Element {
	return (
		<For each={props.options}>
			{(option) => (
				<Select.Option value={option.value}>
					{option.label}
				</Select.Option>
			)}
		</For>
	);
}
