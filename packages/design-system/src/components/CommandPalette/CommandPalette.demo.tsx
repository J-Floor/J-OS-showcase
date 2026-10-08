import { Button, CommandPalette } from "@j-os/design-system";
import { createSignal } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

const FIRST_NAMES = [
	"Ada",
	"Grace",
	"Alan",
	"Edsger",
	"Barbara",
	"Donald",
	"Katherine",
	"Tim",
];
const LAST_NAMES = [
	"Lovelace",
	"Hopper",
	"Turing",
	"Dijkstra",
	"Liskov",
	"Knuth",
	"Johnson",
	"Berners-Lee",
];

// A roster big enough to hit the per-group cap — the case the palette is built
// for, and the one a three-name fixture never shows.
const PEOPLE = FIRST_NAMES.flatMap((first, f) =>
	LAST_NAMES.map((last, l) => ({
		value: `p:${String(f)}-${String(l)}`,
		label: `${first} ${last}`,
		group: "People",
		icon: "person",
		detail: l % 2 === 0 ? "Member" : "Guest",
		keywords: [`${first.toLowerCase()}@example.com`],
		searchOnly: true,
		onSelect: () => {},
	}))
);

const PAGES = [
	{
		value: "page:community",
		label: "Community",
		group: "Pages",
		icon: "groups",
		detail: "/community",
		onSelect: () => {},
	},
	{
		value: "page:tasks",
		label: "Tasks",
		group: "Pages",
		icon: "checklist",
		detail: "/tasks",
		onSelect: () => {},
	},
	{
		value: "page:space",
		label: "Space",
		group: "Pages",
		icon: "meeting_room",
		detail: "/space",
		onSelect: () => {},
	},
];

const TASKS = [
	{
		value: "t:1",
		label: "Fix the door reconciler",
		group: "Tasks",
		icon: "task",
		detail: "Nuki",
		searchOnly: true,
		onSelect: () => {},
	},
	{
		value: "t:2",
		label: "Chase the unsigned agreements",
		group: "Tasks",
		icon: "task",
		detail: "Community",
		searchOnly: true,
		onSelect: () => {},
	},
];

export default {
	title: "CommandPalette",
	render: (p) => {
		const [open, setOpen] = createSignal(true);
		return (
			<>
				<Button
					onClick={() => {
						setOpen(true);
					}}
				>
					Open palette
				</Button>
				<CommandPalette
					open={open()}
					onOpenChange={setOpen}
					items={[...PAGES, ...PEOPLE, ...TASKS]}
					placeholder="Search pages, people, tasks…"
					maxPerGroup={p.maxPerGroup}
					recentsKey={p.recents ? "demo:palette:recents" : undefined}
				/>
			</>
		);
	},
	controls: {
		recents: { type: "boolean", default: true },
		maxPerGroup: { type: "number", default: 8 },
	},
	presets: {
		// Recents are read from localStorage on open; turn them off to see the
		// plain grouped list.
		"Without recents": { recents: false },
		// The 64 people are `searchOnly`, so they only appear once you type — then
		// the heading owns up to how many were left out.
		"Tight cap": { maxPerGroup: 3 },
	},
} satisfies Demo;
