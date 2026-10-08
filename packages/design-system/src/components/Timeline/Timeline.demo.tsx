import { Timeline } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const entries = [
	{
		id: "1",
		at: 1_800_000_000_000,
		kind: "Transitions",
		title: "Promoted to member",
		actor: "Sara",
		icon: "how_to_reg",
	},
	{
		id: "2",
		at: 1_799_000_000_000,
		kind: "Board tasks",
		title: "Added to WhatsApp group",
		actor: "Marc",
		icon: "chat",
	},
	{
		id: "3",
		at: 1_798_000_000_000,
		kind: "Transitions",
		title: "Signed guest agreement",
		icon: "draw",
	},
	{
		id: "4",
		at: 1_797_000_000_000,
		kind: "Field edits",
		title: "Notes changed",
		detail: '"" → "strong"',
		muted: true,
	},
];

export default {
	title: "Timeline",
	render: (p) => (
		<Timeline entries={entries} collapseMuted={p.collapseMuted} />
	),
	controls: { collapseMuted: { type: "boolean", default: true } },
	presets: {
		Collapsed: { collapseMuted: true },
		Expanded: { collapseMuted: false },
	},
} satisfies Demo;
