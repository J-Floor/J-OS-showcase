import type { SelectItem } from "@j-os/design-system";

import { displayName } from "../../../../../convex/lib/names.ts";
import type { Person } from "../../data/tasksData.tsx";

/** One picker option per person, titled with their full name. */
export function personOptions(people: Person[]): SelectItem[] {
	return people.map((person) => ({
		value: person._id,
		title: displayName(person),
	}));
}
