import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import { Timeline, type TimelineEntry } from "./Timeline.tsx";

const entries: TimelineEntry[] = [
	{ id: "1", at: 1_700_000_000_000, kind: "Transitions", title: "Applied" },
	{
		id: "2",
		at: 1_800_000_000_000,
		kind: "Transitions",
		title: "Approved as guest",
		actor: "Marc",
	},
	{
		id: "3",
		at: 1_750_000_000_000,
		kind: "Field edits",
		title: "Notes changed",
		muted: true,
	},
	{
		id: "4",
		at: 1_760_000_000_000,
		kind: "Emails",
		title: "Email sent: approval",
	},
];

test("renders newest first", () => {
	render(() => <Timeline entries={entries} />);
	const titles = screen.getAllByRole("listitem").map((li) => li.textContent);
	expect(titles[0]).toContain("Approved as guest");
	expect(titles[1]).toContain("Email sent: approval");
});

test("shows the actor when there is one", () => {
	render(() => <Timeline entries={entries} />);
	expect(screen.getByText(/Marc/)).toBeInTheDocument();
});

test("offers one filter toggle per kind present", () => {
	render(() => <Timeline entries={entries} />);
	for (const kind of ["Transitions", "Field edits", "Emails"]) {
		expect(
			screen.getByRole("button", { name: new RegExp(kind) })
		).toBeInTheDocument();
	}
});

test("starts with muted kinds filtered out, and the toggle brings them back", async () => {
	render(() => <Timeline entries={entries} />);
	expect(screen.queryByText("Notes changed")).toBeNull();

	fireEvent.click(screen.getByRole("button", { name: /Field edits/ }));
	expect(await screen.findByText("Notes changed")).toBeInTheDocument();
});

test("a kind can be filtered OUT, which one boolean could never do", async () => {
	render(() => <Timeline entries={entries} />);
	expect(screen.getByText("Email sent: approval")).toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: /Emails/ }));
	await waitFor(() => {
		expect(screen.queryByText("Email sent: approval")).toBeNull();
	});
	// Turning one kind off leaves the others alone.
	expect(screen.getByText("Approved as guest")).toBeInTheDocument();
});

test("collapseMuted={false} shows every kind immediately", () => {
	render(() => <Timeline entries={entries} collapseMuted={false} />);
	expect(screen.getByText("Notes changed")).toBeInTheDocument();
});

test("offers no filter bar for a single kind", () => {
	render(() => <Timeline entries={[entries[0], entries[1]]} />);
	expect(screen.queryByRole("button")).toBeNull();
});

test("toggling a kind back off hides it again", async () => {
	render(() => <Timeline entries={entries} />);

	const toggle = screen.getByRole("button", { name: /Field edits/ });
	fireEvent.click(toggle);
	expect(await screen.findByText("Notes changed")).toBeInTheDocument();

	fireEvent.click(toggle);
	await waitFor(() => {
		expect(screen.queryByText("Notes changed")).toBeNull();
	});
});

test("renders nothing crash-worthy for an empty timeline", () => {
	render(() => <Timeline entries={[]} />);
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	expect(screen.queryByRole("button")).toBeNull();
	// Pins the deviation from a bare empty <ul>: a real fallback message, not
	// just "no rows and no buttons" (which a silently-empty list also satisfies).
	expect(screen.getByText("No history yet.")).toBeInTheDocument();
});

test("shows a human-readable date for each entry", () => {
	render(() => <Timeline entries={entries} />);
	// Entry 4 (Emails) has no actor, so its meta row is the date alone —
	// isolates the date assertion from the " · actor" concatenation.
	const expected = new Date(1_760_000_000_000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	expect(screen.getByText(expected)).toBeInTheDocument();
});

test("a kind with only some entries muted starts visible (filter is per kind, not per entry)", () => {
	const mixed: TimelineEntry[] = [
		{ id: "m1", at: 10, kind: "Mixed", title: "Not muted entry" },
		{
			id: "m2",
			at: 20,
			kind: "Mixed",
			title: "Muted entry sharing the kind",
			muted: true,
		},
	];
	render(() => <Timeline entries={mixed} />);
	// "Mixed" is not uniformly muted, so the kind is not collapsed by default:
	// both rows show. `muted` only dims a row (opacity); it does not remove it
	// from a kind that also has non-muted, signal-worthy entries.
	expect(screen.getByText("Not muted entry")).toBeInTheDocument();
	expect(
		screen.getByText("Muted entry sharing the kind")
	).toBeInTheDocument();
});

test("every entry kind (icon, detail, no-actor, muted) renders its title", () => {
	const all: TimelineEntry[] = [
		{ id: "a", at: 1, kind: "K", title: "Plain entry" },
		{
			id: "b",
			at: 2,
			kind: "K",
			title: "With detail",
			detail: "some detail",
		},
		{ id: "c", at: 3, kind: "K", title: "With actor", actor: "Sam" },
		{ id: "d", at: 4, kind: "K", title: "With icon", icon: "check" },
		{ id: "e", at: 5, kind: "K", title: "Muted entry", muted: true },
	];
	render(() => <Timeline entries={all} collapseMuted={false} />);
	for (const entry of all) {
		expect(screen.getByText(entry.title)).toBeInTheDocument();
	}
	expect(screen.getByText("some detail")).toBeInTheDocument();
});
