import { Select, type SelectItem } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SelectOptionList } from "../../../../shared/components/SelectOptionList.tsx";
import type { Person } from "../../data/tasksData.tsx";

import { personOptions } from "./personOptions.ts";

export function PersonSelect(props: {
	people: Person[];
	value?: Id<"people">;
	onChange: (id: Id<"people"> | undefined) => void;
	placeholder?: string;
}): JSX.Element {
	function options(): SelectItem[] {
		return personOptions(props.people);
	}
	return (
		<Select.Root
			options={options()}
			value={props.value ? [props.value] : []}
			placeholder={props.placeholder ?? "Select…"}
			allowClearing
			sameWidth
			onValueChange={(details) => {
				props.onChange(details.value[0] as Id<"people"> | undefined);
			}}
		>
			<SelectOptionList options={options()} />
		</Select.Root>
	);
}
