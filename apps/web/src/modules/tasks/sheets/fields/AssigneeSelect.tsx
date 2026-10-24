import { Select } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Person } from "../../data/tasksData.tsx";

import { PersonOptions } from "./PersonOptions.tsx";

export function AssigneeSelect(props: {
	label: string;
	people: Person[];
	value: Id<"people">[];
	onChange: (ids: Id<"people">[]) => void;
}): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden
			multiple
			value={props.value}
			placeholder="Add assignees…"
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				props.onChange(details.value as Id<"people">[]);
			}}
		>
			<PersonOptions people={props.people} />
		</Select.Root>
	);
}
