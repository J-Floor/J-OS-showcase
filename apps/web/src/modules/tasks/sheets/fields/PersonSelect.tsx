import { Select } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Person } from "../../data/tasksData.tsx";

import { PersonOptions } from "./PersonOptions.tsx";

export function PersonSelect(props: {
	label: string;
	people: Person[];
	value?: Id<"people">;
	onChange: (id: Id<"people"> | undefined) => void;
	placeholder?: string;
}): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden
			value={props.value ? [props.value] : []}
			placeholder={props.placeholder ?? "Select…"}
			allowClearing
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				props.onChange(details.value[0] as Id<"people"> | undefined);
			}}
		>
			<PersonOptions people={props.people} />
		</Select.Root>
	);
}
