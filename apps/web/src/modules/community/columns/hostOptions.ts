import { shortNames } from "../../../../convex/lib/names.ts";

/** A guest whose host is a legacy name string nobody has resolved to a board
 *  member yet. One bucket, not one option per stale name. */
export const UNRESOLVED_HOST = "__unresolved__";
/** A guest nobody is vouching for. */
export const NO_HOST = "__none__";

export type HostOption = { value: string; label: string };

type HostCandidate = { _id: string; firstName: string; lastName: string };

/**
 * The "Hosted by" filter options: the current board, plus the two buckets a
 * guest can fall into without one.
 *
 * Values are board-member IDS, not names, so a rename never invalidates a saved
 * filter and two people called Alan stay two options. Labels come from
 * {@link shortNames}, which only reaches for a surname initial when it has to.
 *
 * The two synthetic buckets are last on purpose — they are states, not people,
 * and mixing them into the alphabetical run of names reads as though somebody
 * were called "Unassigned".
 */
export function hostOptions(
	boardLevel: readonly HostCandidate[]
): HostOption[] {
	const labels = shortNames(boardLevel);
	return [
		...boardLevel.map((s) => ({
			value: s._id,
			label: labels.get(s._id) ?? "—",
		})),
		{ value: UNRESOLVED_HOST, label: "Unresolved (imported)" },
		{ value: NO_HOST, label: "No host" },
	];
}

/** Which bucket a guest's host falls into, for the enum filter above. */
export function hostValue(row: {
	hostedById?: string;
	hostedBy?: string;
}): string {
	if (row.hostedById !== undefined) return row.hostedById;
	return row.hostedBy !== undefined ? UNRESOLVED_HOST : NO_HOST;
}
