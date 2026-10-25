import { Select } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import { displayName } from "../../../convex/lib/names.ts";
import type { BoardLevelPerson } from "../../../convex/lib/personViews.ts";

/** One picker option per person, valued by their id and labelled with their
 *  full name. */
export function PersonOptions(props: {
	people: readonly Pick<BoardLevelPerson, "_id" | "firstName" | "lastName">[];
}): JSX.Element {
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
