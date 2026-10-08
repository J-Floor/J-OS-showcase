import type { Doc } from "../_generated/dataModel";

/**
 * What a person's browser may see of their OWN `people` row.
 *
 * An allowlist, not a denylist: the row also carries board-only data (the
 * board's `noteLog` and `score` on their application, why the door was
 * overridden and by whom). Hiding those in the UI is not enough — every query result
 * is readable in the network tab. A field added to `people` later stays
 * server-side until someone adds it here.
 */
const SELF_FIELDS = [
	"_id",
	"_creationTime",
	"email",
	"firstName",
	"lastName",
	"phone",
	"tier",
	"stage",
	"stageSince",
	"formerOf",
	"formerReason",
	"accessFrom",
	"accessUntil",
	"accessUntilLocal",
	"vertical",
	"venture",
	"hostedById",
	"hostedBy",
	"lastPath",
	"onboarding",
	"doorsIntroSeenAt",
	"submittedAt",
	"verifiedAt",
] as const satisfies readonly (keyof Doc<"people">)[];

export type SelfPerson = Pick<Doc<"people">, (typeof SELF_FIELDS)[number]> & {
	/** Only the override itself: the reason and who set it are board notes. */
	door?: Pick<NonNullable<Doc<"people">["door"]>, "override">;
};

export function selfView(person: Doc<"people">): SelfPerson {
	const view: Record<string, unknown> = {};
	for (const field of SELF_FIELDS)
		if (person[field] !== undefined) view[field] = person[field];
	if (person.door) view.door = { override: person.door.override };
	return view as SelfPerson;
}

/**
 * A board/admin member as the Tasks module and the host pickers see them —
 * enough to name and pick them. `listBoardLevel` also serves core members, who
 * must not receive the rest of a board member's row.
 */
export type BoardLevelPerson = Pick<
	Doc<"people">,
	"_id" | "firstName" | "lastName" | "tier"
>;

export function boardLevelView(person: Doc<"people">): BoardLevelPerson {
	return {
		_id: person._id,
		firstName: person.firstName,
		lastName: person.lastName,
		tier: person.tier,
	};
}
