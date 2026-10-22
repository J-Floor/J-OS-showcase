import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/**
 * The person fields a roster column and the person sheet both show. Each
 * key is the column's id, each label its header: the column takes both from
 * here (`fieldColumn`), the sheet marks the value showing the same field
 * (`PropertyRow field`, or `morphPart` where the sheet words it differently),
 * and a morph flies the one into the other.
 */
export const personFields = defineFields({
	firstName: { label: "First name" },
	lastName: { label: "Last name" },
	email: { label: "Email", icon: ICONS.email },
	phone: { label: "Phone", icon: ICONS.phone },
	ventureName: { label: "Venture", icon: ICONS.venture },
	hostedById: { label: "Hosted by", icon: ICONS.host },
	notes: { label: "Notes" },
	score: { label: "Score" },
	createdAt: { label: "Date" },
	timeRemaining: { label: "Time remaining" },
	vertical: { label: "Vertical" },
	description: { label: "Description", icon: ICONS.description },
	pastBuilt: { label: "Past built", icon: ICONS.pastBuilt },
	whyJoin: { label: "Why join", icon: ICONS.whyJoin },
	productStage: { label: "Product stage", icon: ICONS.productStage },
	fundingStage: { label: "Funding stage", icon: ICONS.fundingStage },
	teamSize: { label: "Team size", icon: ICONS.teamSize },
	referral: { label: "Referral", icon: ICONS.share },
	links: { label: "Links", icon: ICONS.link },
});
