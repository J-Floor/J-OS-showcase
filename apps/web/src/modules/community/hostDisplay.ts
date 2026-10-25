import type { Doc } from "../../../convex/_generated/dataModel";
import { staffName, type StaffMember } from "../../shared/data/boardLevel.tsx";

/**
 * A person's host for display: the referenced board member's name via
 * `hostedById`, falling back to the legacy `hostedBy` string. `loading` while
 * a referenced host waits on the board list.
 */
export function hostDisplay(
	staff: StaffMember[] | undefined,
	person: Pick<Doc<"people">, "hostedById" | "hostedBy">
): { name: string | undefined; loading: boolean } {
	const id = person.hostedById;
	const name = id ? staffName(staff, id) : null;
	return { name: name ?? person.hostedBy, loading: name === undefined };
}
