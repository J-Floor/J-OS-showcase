export type PerksError =
	| { type: "PerkNotFound" }
	| { type: "PerkExpired" }
	| { type: "PerkFieldRequired" }
	| { type: "PerkContactNotBoard" }
	| { type: "PerkLinkInvalid" }
	| { type: "PerkDateInvalid" }
	| { type: "PerkRequestNotFound" };

export const perksMessages: Record<PerksError["type"], string> = {
	PerkNotFound: "This perk is no longer available.",
	PerkExpired: "This perk has expired.",
	PerkFieldRequired: "Partner, perk and terms are required.",
	PerkContactNotBoard:
		"The contact must be a board member or admin with access.",
	PerkLinkInvalid: "The link must be a web address (http or https).",
	PerkDateInvalid: "The end date must be a valid date.",
	PerkRequestNotFound: "Request not found.",
};
