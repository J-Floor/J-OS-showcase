import type { Accessor } from "solid-js";

import { displayName } from "../../../convex/lib/names.ts";
import type { PersonRow } from "../../../convex/people.ts";
import { prefetchSpec } from "../../shared/data/queryKeeper.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { lazyPeek } from "../../shared/entity/lazyPeek.tsx";
import { ICONS } from "../../shared/icons.ts";

import { attendedEventsQuery } from "./queries.ts";
import { useReadyRosters } from "./rosterOf.ts";

/**
 * The community "person" entity: every row across the three board rosters
 * (members, guests, applications), searchable and deep-linkable to
 * `/community?person=<id>`.
 *
 * Deliberately has NO `tab`: which roster someone belongs to changes when a
 * guest becomes a member or an application is decided, and a static tab baked
 * into a shared link would go stale — see `CommunityPage`'s `tabOf` docstring.
 * `CommunityPage` derives the tab live off the same rosters instead.
 */
export const personEntity: EntityDescriptor<PersonRow> = {
	key: "person",
	route: "/community",
	param: "person",
	group: "People",
	icon: ICONS.person,
	// Called inside a component: reads the same warm, session-level roster
	// subscriptions the board console already keeps open (CommunityDataProvider),
	// so searching for a person costs no extra query — the same union, in the
	// same order, that the board console renders.
	useRows: (): Accessor<PersonRow[] | undefined> => {
		const rosters = useReadyRosters();
		// Undefined until all three have answered: a partial union would make
		// the selection treat someone on a roster still loading as a dead link
		// and drop the open param. A move between rosters can show the person
		// in neither for a moment (the queries reach the app one by one, though
		// the Convex client holds one consistent result set); the selection
		// tolerates that.
		return () => {
			const ready = rosters();
			return (
				ready && [
					...ready.members,
					...ready.guests,
					...ready.applications,
				]
			);
		};
	},
	label: (row) => displayName(row),
	// The email is often how a board member knows someone, but it is not a
	// better name for them — keywords rank below the name by design.
	keywords: (row) =>
		[row.email, row.venture?.name ?? ""].filter((term) => term !== ""),
	detail: (row) => row.venture?.name,
	ability: { action: "view", subject: "Applications" },
	// PersonDetail's "Came from" row, which renders for every status.
	// Board-level on the server, like this descriptor's own ability.
	prefetch: (row, canPerform) => {
		if (canPerform("view", "Applications"))
			prefetchSpec(attendedEventsQuery, row._id);
	},
	peek: lazyPeek(() =>
		import("./PersonPeek.tsx").then((module) => module.PersonPeek)
	),
};
