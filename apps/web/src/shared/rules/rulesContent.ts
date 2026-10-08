// House rules, shared by onboarding (step B) and the Space "Rules" tab.
// Condensed from the J floor Space Guide. Plain data, not JSX, so the rules can
// be searched and the match highlighted: a `{ strong }` segment renders bold.

/** A run of text in a rule; `{ strong }` renders bold. */
export type RuleSegment = string | { strong: string };
/** Whether a segment is a bold run. */
export function isStrong(segment: RuleSegment): segment is { strong: string } {
	return typeof segment !== "string";
}

/** One rule — one paragraph, one card. */
export type Rule = readonly RuleSegment[];
export type RuleSection = {
	id: string;
	heading: string;
	rules: readonly Rule[];
};

export const RULES_SEARCH_LABEL = "Search rules";

export const RULES_INTRO =
	"Read this before your first day. For formal membership terms, see the J floor Membership Agreement.";

export const RULES: readonly RuleSection[] = [
	{
		id: "community",
		heading: "Community",
		rules: [
			[{ strong: "Show up regularly" }, " and be part of the community."],
			["Keep an eye on, and participate in, the WhatsApp group."],
			[
				{ strong: "Be generous" },
				". The community is all about sharing, helping and exchanging. Make introductions. Share your insights. The best members give more than they take.",
			],
			[
				"J floor runs on volunteers — if something's broken, say something; if you can fix it, even better. Got an event idea? Bring it up.",
			],
		],
	},
	{
		id: "space",
		heading: "Space",
		rules: [
			[
				{ strong: "Keep it clean" },
				". Leave the space as you found it. If you see something dirty, clean it. If you see someone cleaning, help them. If you see someone making a mess, tell them to clean.",
			],
			[
				{ strong: "First come first serve" },
				". There are no assigned desks or monitors.",
			],
			[
				{ strong: "Silent rooms are silent." },
				" For meetings, go in an empty room, meeting booths or the lobby. If there are other people, ask if the noise will bother them.",
			],
			[
				"If something is broken, let the board know. No one will fix it if no one knows about it.",
			],
			[
				{ strong: "If you leave last in the evening" },
				", close all windows, turn off all lights and fans, and lock the door.",
			],
		],
	},
	{
		id: "kitchen",
		heading: "Kitchen",
		rules: [
			[
				{ strong: "Label your food" },
				'. If it\'s for everyone, label it "FREE" and write in the WhatsApp group.',
			],
			["Don't let food perish. Enclose smelly food."],
			[
				"Load dirty dishes into the dishwasher. If it's full, start it. If it's done, empty it. If people left dirty dishes in the sink, load them in.",
			],
			[
				"Coffee, tea and drinks are provided — donate via the QR codes and be fair about what you use. Refill toilet paper and soap from storage.",
			],
		],
	},
	{
		id: "access",
		heading: "Access & security",
		rules: [
			[
				"Entry and exit are logged. ",
				{ strong: "Don't share your access credentials" },
				" or let non-members in through your account.",
			],
			[
				"WiFi is for work — no illegal activity, network abuse, or bypassing security.",
			],
			[
				"Access is 24/7. If you're last out, check no water is running, the lights are off, and all windows and doors are closed.",
			],
		],
	},
	{
		id: "safety",
		heading: "Safety",
		rules: [
			[
				"Keep emergency exits and escape routes clear — they're not balconies. Know your nearest exit and where the first-aid kits and extinguishers are, and report hazards immediately. Use everything at your own risk.",
			],
			[
				"Open windows responsibly — don't lean out, sit on sills, or pass objects through them, and close them when you leave.",
			],
			[
				"J floor is ",
				{ strong: "non-smoking" },
				" (inside, stairwells, exits, windows), and ",
				{ strong: "illegal substances are strictly prohibited" },
				".",
			],
		],
	},
	{
		id: "belongings",
		heading: "Your belongings",
		rules: [
			[
				"Storing equipment needs Board permission and is at your own risk — J floor isn't liable for loss or theft. Remove everything by your last day; items left 14+ days may be discarded.",
			],
			[
				"Deliveries are fine for active members but aren't guaranteed — label them with your name and collect them promptly.",
			],
		],
	},
	{
		id: "confidentiality",
		heading: "Confidentiality",
		rules: [
			[
				"Don't share confidential information about other members outside J floor.",
			],
			["Don't record without permission."],
		],
	},
	{
		id: "scaling",
		heading: "Scaling & changes",
		rules: [
			[
				"J floor is for the beginning — outgrow us and we'll help you move on while you stay part of the community.",
			],
			[
				"This guide may change; the latest version is authoritative, and material changes are shared through official channels.",
			],
		],
	},
];
