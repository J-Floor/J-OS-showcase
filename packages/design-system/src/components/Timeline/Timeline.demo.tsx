import { EmptyState, Timeline } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const entries = [
	{
		id: "1",
		at: 1_800_000_000_000,
		kind: "Transitions",
		title: "Status changed to active",
		actor: "Sara",
		icon: "check_circle",
	},
	{
		id: "2",
		at: 1_799_000_000_000,
		kind: "Comments",
		title: "Comment added",
		actor: "Marc",
		icon: "chat",
	},
	{
		id: "3",
		at: 1_798_000_000_000,
		kind: "Transitions",
		title: "Agreement signed",
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
		<Timeline
			entries={p.empty ? [] : entries}
			collapseMuted={p.collapseMuted}
		>
			{p.customEmpty ? (
				<Timeline.Empty>
					<EmptyState icon="history" title="No events yet" />
				</Timeline.Empty>
			) : null}
		</Timeline>
	),
	controls: {
		collapseMuted: { type: "boolean", default: true },
		empty: { type: "boolean", default: false },
		customEmpty: { type: "boolean", default: false },
	},
	presets: {
		Collapsed: { collapseMuted: true },
		Expanded: { collapseMuted: false },
		Empty: { empty: true },
		"Custom empty": { empty: true, customEmpty: true },
	},
} satisfies Demo;
