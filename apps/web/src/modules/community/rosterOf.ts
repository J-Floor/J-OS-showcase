import type { Id } from "../../../convex/_generated/dataModel";

import {
	useApplications,
	useGuests,
	useMembers,
} from "./data/communityData.tsx";

/** The tabs that list people, one roster each. */
export type RosterKey = "applications" | "members" | "guests";

/** The three board rosters, each `undefined` until it has answered. */
type LoadingRosters = Record<
	RosterKey,
	readonly { _id: Id<"people"> }[] | undefined
>;

/** The roster a person's row lives in, looked up live in the three rosters.
 *  Applications win over members, members over guests, so a person mid-move
 *  resolves to one tab only. */
export function rosterOf(
	id: Id<"people">,
	rosters: LoadingRosters
): RosterKey | undefined {
	if ((rosters.applications ?? []).some((row) => row._id === id))
		return "applications";
	if ((rosters.members ?? []).some((row) => row._id === id)) return "members";
	return (rosters.guests ?? []).some((row) => row._id === id)
		? "guests"
		: undefined;
}

/** The three rosters, each `undefined` until it has answered. Free to call:
 *  the queries are the warm, session-wide ones (see CommunityDataProvider). */
export function useRosters() {
	const applications = useApplications();
	const members = useMembers();
	const guests = useGuests();
	return () => ({
		applications: applications.data(),
		members: members.data(),
		guests: guests.data(),
	});
}

/** The rosters once ALL of them have answered, so "in none of them" is a
 *  fact rather than "not yet"; `undefined` until then. A partial union would
 *  make a selection treat someone on a roster still loading as a dead link. */
export function useReadyRosters() {
	const rosters = useRosters();
	return () => {
		const { applications, members, guests } = rosters();
		return applications === undefined ||
			members === undefined ||
			guests === undefined
			? undefined
			: { applications, members, guests };
	};
}
