import { Select, type SelectItem } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

/** A `Select.Root`'s dropdown: one option per item, in order. */
export function SelectOptionList(props: {
	options: SelectItem[];
}): JSX.Element {
	return (
		<Select.Content>
			<For each={props.options}>
				{(option) => (
					<Select.Option value={option.value} title={option.title} />
				)}
			</For>
		</Select.Content>
	);
}
