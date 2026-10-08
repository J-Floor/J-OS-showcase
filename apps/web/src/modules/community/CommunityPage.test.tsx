// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// Stub the three tabs and the board-contacts fallback so the page test doesn't
// pull the Table/Convex chain. Each stub records what the page handed it, read
// inside an effect so a later change (the URL naming someone, a tab coming on
// screen) is picked up rather than frozen at mount.
type Recorded = {
	selection?: PersonSelection;
	selectedId?: string;
	active?: boolean;
};
const applicationsProps: Recorded = {};
const membersProps: Recorded = {};
const guestsProps: Recorded = {};
function reset(): void {
	for (const recorded of [applicationsProps, membersProps, guestsProps]) {
		recorded.selection = undefined;
		recorded.selectedId = undefined;
		recorded.active = undefined;
	}
}
function record(into: Recorded, props: TabProps): void {
	createEffect(() => {
		into.selection = props.selection;
		into.selectedId = props.selection.selectedId();
		into.active = props.active;
	});
}
vi.mock("./tabs/ApplicationsTab.tsx", () => ({
	ApplicationsTab: (props: TabProps) => {
		record(applicationsProps, props);
		return <div>applications-tab</div>;
	},
}));
// Captures what the page hands down, so the deep-link plumbing can be tested
// without dragging the whole Members table in.
vi.mock("./tabs/MembersTab.tsx", () => ({
	MembersTab: (props: TabProps) => {
		record(membersProps, props);
		return <div>members-tab</div>;
	},
}));
vi.mock("./tabs/GuestsTab.tsx", () => ({
	GuestsTab: (props: TabProps) => {
		record(guestsProps, props);
		return <div>guests-tab</div>;
	},
}));
vi.mock("./MemberCommunity.tsx", () => ({
	MemberCommunity: () => <div>member-community</div>,
}));
// MyProfile pulls convex-solidjs; the page test only covers tab chrome.
vi.mock("./MyProfile.tsx", () => ({
	MyProfile: () => <div>my-profile</div>,
}));

// ExportActions pulls the Convex data chain (useQuery needs ConvexProvider);
// this page test only covers tab chrome + ability gating, so stub it.
vi.mock("./actions/ExportActions.tsx", () => ({
	ExportActions: () => <div>export-actions</div>,
}));

// The page reads the rosters itself now — the tab a `?person=` link belongs to
// is a fact about that person, not something the link is trusted to carry. Only
// the ids matter here; the stubbed tabs never render a row.
vi.mock("./data/communityData.tsx", () => {
	function roster(rows: unknown[]) {
		return () => ({
			data: () => rows,
			isLoading: () => false,
			error: () => undefined,
			isStale: () => false,
			refetch: () => {},
		});
	}
	return {
		useMembers: roster([{ _id: "p1" }]),
		useGuests: roster([{ _id: "g1" }]),
		useApplications: roster([]),
	};
});
vi.mock("../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({
		data: () => [],
		isLoading: () => false,
		error: () => undefined,
		isStale: () => false,
		refetch: () => {},
	}),
}));

// jsdom gaps ark Tabs touches at mount.
if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { CommunityPage } from "./CommunityPage.tsx";
import type { PersonSelection, TabProps } from "./tabs/TabProps.ts";

// CommunityPage gates on <Can> (CASL ability), which reads the AbilityContext that
// <AbilityProvider> supplies — in production that provider lives in the router
// (routing/index.tsx), fed by useRole. Mirror that here by rendering the page
// inside AbilityProvider with the role under test.
// MemoryRouter is required because CommunityPage now uses useSearchParams.
function renderAs(role: Role) {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<CommunityPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

/** Render CommunityPage (as board) inside a MemoryRouter at a given path.
 *  Returns the history so a test can navigate afterwards. */
function renderAtPath(path: string) {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	return {
		...render(() => (
			<MemoryRouter history={history}>
				<Route
					path="*"
					component={() => (
						<AbilityProvider role="board">
							<CommunityPage />
						</AbilityProvider>
					)}
				/>
			</MemoryRouter>
		)),
		history,
	};
}

test("board sees the three tab triggers", () => {
	renderAs("board");
	expect(screen.getByText("Applications")).toBeInTheDocument();
	expect(screen.getByText("Members")).toBeInTheDocument();
	expect(screen.getByText("Guests")).toBeInTheDocument();
});

test("non-board sees the member community surface, not the admin tabs", () => {
	renderAs("member");
	// Fallback for <Can I="view" a="Applications"> is <MemberCommunity />.
	expect(screen.getByText("member-community")).toBeInTheDocument();
	expect(screen.queryByText("Applications")).not.toBeInTheDocument();
	expect(screen.queryByText("Guests")).not.toBeInTheDocument();
});

test("staff sees the member community surface, not the admin tabs", () => {
	renderAs("staff");
	expect(screen.getByText("member-community")).toBeInTheDocument();
	expect(screen.queryByText("Applications")).not.toBeInTheDocument();
});

test("board and admin get a My profile tab, last", () => {
	for (const role of ["board", "admin"] as const) {
		renderAs(role);
		const names = screen.getAllByRole("tab").map((tab) => tab.textContent);
		expect(names).toEqual([
			"Applications",
			"Members",
			"Guests",
			"Insights",
			"My profile",
		]);
		cleanup();
	}
});

test("?tab=profile opens the caller's own profile", () => {
	renderAtPath("/community?tab=profile");
	expect(screen.getByRole("tab", { name: "My profile" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(screen.getByText("my-profile")).toBeInTheDocument();
});

// ── URL-driven tab tests ──────────────────────────────────────────────────────
// These use MemoryRouter so that useSearchParams is live. We assert on
// aria-selected of the tab triggers (Ark sets aria-selected="true" on the
// active trigger), which is immune to the DOM-presence / hidden-attribute
// question — the active trigger is always unambiguous.

test("no ?tab param defaults to Applications trigger selected", () => {
	renderAtPath("/community");
	expect(screen.getByRole("tab", { name: "Applications" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
		"aria-selected",
		"false"
	);
});

test("?tab=members selects the Members trigger", () => {
	renderAtPath("/community?tab=members");
	expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(screen.getByRole("tab", { name: "Applications" })).toHaveAttribute(
		"aria-selected",
		"false"
	);
});

test("?tab=bogus falls back to Applications trigger selected", () => {
	renderAtPath("/community?tab=bogus");
	expect(screen.getByRole("tab", { name: "Applications" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
});

test("clicking Guests trigger makes Guests selected", async () => {
	renderAtPath("/community");
	// Initially Applications is selected
	expect(screen.getByRole("tab", { name: "Applications" })).toHaveAttribute(
		"aria-selected",
		"true"
	);

	// Click the Guests trigger
	fireEvent.click(screen.getByRole("tab", { name: "Guests" }));

	// Guests trigger should now be selected (waitFor retries until reactive
	// updates from setParams propagate through the MemoryRouter).
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Guests" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
});

test("hands a ?person= deep link to the tab that person lives in", async () => {
	// Global search links straight to a person from anywhere in the app, naming
	// only the person. The page finds them in the members roster and takes the
	// link there.
	reset();
	renderAtPath("/community?person=p1");
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	expect(membersProps.selectedId).toBe("p1");
});

test("passes no person when the URL names none", () => {
	reset();
	renderAtPath("/community?tab=members");
	// The stub must have rendered and recorded a selection, or the assertion
	// below would pass without anything having been asked.
	expect(membersProps.selection).toBeDefined();
	expect(membersProps.selectedId).toBeUndefined();
});

test("gives every tab the same selection, and only the person's tab is active", async () => {
	// The sequence that produced stacked drawers: visit a tab (panels are lazily
	// mounted but never unmounted), then open somebody. All three tabs now share
	// ONE selection; which of them shows a drawer is each tab's own check of its
	// own rows, covered by the tab tests.
	reset();
	const { history } = renderAtPath("/community?tab=guests");
	await waitFor(() => {
		expect(guestsProps.selection).toBeDefined();
	});

	history.set({ value: "/community?tab=guests&person=p1", scroll: false });
	// p1 is a member, so the link goes to Members whatever the URL said...
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	await waitFor(() => {
		expect(membersProps.active).toBe(true);
	});
	expect(guestsProps.active).toBe(false);
	// ...and every mounted tab holds the one selection.
	expect(membersProps.selection).toBeDefined();
	expect(guestsProps.selection).toBe(membersProps.selection);
});

test("keeps the deep link on a URL whose tab param is nonsense", async () => {
	// `Tabs.Root` falls back to Applications for an unrecognised value and does
	// NOT rewrite the URL, so the visible tab and the param disagree. Keying the
	// deep link off the raw param dropped it on exactly those URLs.
	reset();
	renderAtPath("/community?tab=bogus&person=p1");
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	expect(membersProps.selectedId).toBe("p1");
});
