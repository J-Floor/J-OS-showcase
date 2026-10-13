import type { Id } from "../../../convex/_generated/dataModel";
import { staffName, type StaffMember } from "../../shared/data/boardLevel.tsx";

const BOARD = "Board";

/**
 * A board note's author for display; `undefined` while the board list loads.
 * The one migrated legacy note has no author, and a note by someone no longer
 * on the board resolves to no one. Both read as "Board", the same thing the
 * old "[name]:" blob said when it said nothing.
 */
export function noteAuthor(
	staff: StaffMember[] | undefined,
	authorId: Id<"people"> | undefined
): string | undefined {
	if (!authorId) return BOARD;
	const name = staffName(staff, authorId);
	return name === null ? BOARD : name;
}
