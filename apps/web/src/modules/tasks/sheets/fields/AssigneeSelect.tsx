import { Select, type SelectItem } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SelectOptionList } from "../../../../shared/components/SelectOptionList.tsx";
import type { Person } from "../../data/tasksData.tsx";

import { personOptions } from "./personOptions.ts";

export function AssigneeSelect(props: {
	people: Person[];
	value: Id<"people">[];
	onChange: (ids: Id<"people">[]) => void;
}): JSX.Element {
	function options(): SelectItem[] {
		return personOptions(props.people);
	}
	return (
		<Select.Root
			multiple
			options={options()}
			value={props.value}
			placeholder="Add assignees…"
			sameWidth
			onValueChange={(details) => {
				props.onChange(details.value as Id<"people">[]);
			}}
		>
			<SelectOptionList options={options()} />
		</Select.Root>
	);
}
