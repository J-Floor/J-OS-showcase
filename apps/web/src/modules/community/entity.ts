import type { Accessor } from "solid-js";

import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { ICONS } from "../../shared/icons.ts";

import {
	useApplications,
	useGuests,
	useMembers,
} from "./data/communityData.tsx";
import type { PersonRow } from "./insights/metrics.ts";

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
		const members = useMembers();
		const guests = useGuests();
		const applications = useApplications();
		return () => [
			...(members.data() ?? []),
			...(guests.data() ?? []),
			...(applications.data() ?? []),
		];
	},
	label: (row) => `${row.firstName} ${row.lastName}`.trim(),
	// The email is often how a board member knows someone, but it is not a
	// better name for them — keywords rank below the name by design.
	keywords: (row) =>
		[row.email, row.venture?.name ?? ""].filter((k) => k !== ""),
	detail: (row) => row.venture?.name,
	ability: { action: "view", subject: "Applications" },
};
