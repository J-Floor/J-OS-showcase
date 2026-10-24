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

// A list big enough to hit the per-group cap — the case the palette is built
// for, and the one a three-name fixture never shows.
const RECORDS = FIRST_NAMES.flatMap((first, f) =>
	LAST_NAMES.map((last, l) => ({
		value: `r:${String(f)}-${String(l)}`,
		label: `${first} ${last}`,
		group: "Records",
		icon: "description",
		detail: l % 2 === 0 ? "Draft" : "Final",
		keywords: [`${first.toLowerCase()}@example.com`],
		searchOnly: true,
		onSelect: () => {},
	}))
);

const PAGES = [
	{
		value: "page:overview",
		label: "Overview",
		group: "Pages",
		icon: "home",
		detail: "/overview",
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
		value: "page:settings",
		label: "Settings",
		group: "Pages",
		icon: "settings",
		detail: "/settings",
		onSelect: () => {},
	},
];

const TASKS = [
	{
		value: "t:1",
		label: "Fix the sync job",
		group: "Tasks",
		icon: "task",
		detail: "Backend",
		searchOnly: true,
		onSelect: () => {},
	},
	{
		value: "t:2",
		label: "Chase the unsigned forms",
		group: "Tasks",
		icon: "task",
		detail: "Overview",
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
					items={[...PAGES, ...RECORDS, ...TASKS]}
					placeholder="Search pages, records, tasks…"
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
		// The 64 records are `searchOnly`, so they only appear once you type — then
		// the heading owns up to how many were left out.
		"Tight cap": { maxPerGroup: 3 },
	},
} satisfies Demo;
