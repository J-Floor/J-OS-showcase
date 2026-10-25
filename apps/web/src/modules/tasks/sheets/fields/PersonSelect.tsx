import { Select, type SelectRootProps } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { PersonOptions } from "../../../../shared/components/PersonOptions.tsx";
import type { Person } from "../../data/tasksData.tsx";

export function PersonSelect(
	props: Pick<SelectRootProps, "label" | "placeholder"> & {
		people: Person[];
		value?: Id<"people">;
		onChange: (id: Id<"people"> | undefined) => void;
	}
): JSX.Element {
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
