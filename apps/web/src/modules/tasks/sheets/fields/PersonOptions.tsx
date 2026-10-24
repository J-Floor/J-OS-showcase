import { Select } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import { displayName } from "../../../../../convex/lib/names.ts";
import type { Person } from "../../data/tasksData.tsx";

/** One picker option per person, labelled with their full name. */
export function PersonOptions(props: { people: Person[] }): JSX.Element {
	return (
		<For each={props.people}>
			{(person) => (
				<Select.Option value={person._id}>
					{displayName(person)}
				</Select.Option>
			)}
		</For>
	);
}
