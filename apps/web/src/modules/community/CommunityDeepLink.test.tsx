// @vitest-environment happy-dom
import {
	MemoryRouter,
	Route,
	Router,
	createMemoryHistory,
	useNavigate,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

afterEach(cleanup);
beforeEach(() => {
	shared.setLoaded(true);
	shared.applicants = false;
});

// jsdom gaps ark Tabs / the Table touch at mount.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const rows = [
	{
		_id: "p1",
		_creationTime: 0,
		firstName: "Alan",
		lastName: "Turing",
		email: "alan@example.com",
		tier: "board",
		stage: "active",
		status: {
			tier: "board",
			stage: "active",
			tone: "success",
			flags: [],
			facts: [],
			boardTasks: [],
			sinceDays: 0,
		},
		hasAgreement: false,
	},
] as unknown as MemberRow[];

const guestRows = [
	{
		_id: "g1",
		_creationTime: 0,
		firstName: "Grace",
		lastName: "Hopper",
		email: "grace@example.com",
		tier: "guest",
		stage: "active",
		status: {
			tier: "guest",
			stage: "active",
			tone: "success",
			flags: [],
			facts: [],
			boardTasks: [],
			sinceDays: 0,
		},
		hasAgreement: false,
	},
] as unknown as MemberRow[];

function applicant(id: string, firstName: string) {
	return {
		_id: id,
		_creationTime: 0,
		firstName,
		lastName: "Applicant",
		name: `${firstName} Applicant`,
		email: `${id}@example.com`,
		tier: "prospect",
		stage: "verified",
		status: {
			tier: "prospect",
			stage: "verified",
			tone: "info",
			flags: [],
			facts: [],
			boardTasks: [],
			sinceDays: 0,
		},
		hasAgreement: false,
	};
}

/** Two unscored applicants, so the pipeline has a row to open and a neighbour
 *  for the drawer's Next arrow to move to. */
const applicantRows = [
	applicant("a1", "Zed"),
	applicant("a2", "Yan"),
] as unknown as MemberRow[];

/**
 * The setter for "have the rosters answered yet", published by the mock below.
 *
 * The signal itself has to be created by the SAME solid-js instance the app
 * runs on, so it is made inside the (async) mock factory rather than out here —
 * a `require("solid-js")` in a hoisted block returns a second copy of the
 * module, whose signals no effect in the app is subscribed to, and every write
 * to it is silently ignored.
 */
const shared = vi.hoisted(() => ({
	setLoaded: (value: boolean): void => {
		void value;
	},
	/** Whether the Applications roster holds the two applicants below. Off by
	 *  default so the tests that name a member or guest keep an empty pipeline. */
	applicants: false,
}));

// Only this module is mocked: `./data/useMembers` and its siblings are
// re-exports of it, so they resolve to the mock too.
vi.mock("./data/communityData.tsx", async () => {
	const { createSignal } = await import("solid-js");
	const [loaded, setLoaded] = createSignal(true);
	shared.setLoaded = setLoaded;
	// The tabs read `isLoading` as well as `data`, so a roster mock that
	// answers only `data` crashes the tab rather than failing the assertion.
	function roster(data: () => unknown[]) {
		return () => ({
			data: () => (loaded() ? data() : undefined),
			isLoading: () => !loaded(),
			error: () => undefined,
			isStale: () => false,
			refetch: () => {},
		});
	}
	return {
		useMembers: roster(() => rows),
		useGuests: roster(() => guestRows),
		useApplications: roster(() => (shared.applicants ? applicantRows : [])),
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
vi.mock("./actions/ExportActions.tsx", () => ({
	ExportActions: () => <div>export-actions</div>,
}));
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => undefined, isLoading: () => false }),
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
	useMutation: () => ({
		mutateAsync: () => Promise.resolve(),
		mutate: vi.fn(),
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
		reset: vi.fn(),
	}),
}));

// Everything below the mocks: only `CommunityPage` strictly has to be, but the
// import ordering rule wants one unbroken block, so they all sit together.
import { AbilityProvider } from "../../lib/ability.tsx";
import { lazyPage } from "../../shared/lazyPage.tsx";

import type { MemberRow } from "./columns/memberColumns.tsx";
import { CommunityPage } from "./CommunityPage.tsx";
import { openPanel } from "./tabs/testSelection.tsx";

function renderAtPath(path: string) {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	const result = render(() => (
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
	));
	return { ...result, url: () => history.get() };
}

test("a ?person= link opens that person's drawer, on the tab they live in", async () => {
	// The link names only the person. Which tab they belong to is a fact about
	// them, read off the rosters here — global search used to guess it and put
	// the guess in the URL, where nothing could correct it.
	const { url } = renderAtPath("/community?person=p1");
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
	// And it got there by actually switching tabs, not by opening a drawer over
	// the wrong table. `activeTab()` resolves this straight from the rosters on
	// the very first render (so Members, not Applications, is what mounts), but
	// the deep-link effect still pins `?tab=members` into the URL a tick later
	// — otherwise closing the drawer clears `?person=` and, with no `?tab=` of
	// its own, the board would fall back to Applications under it.
	expect(url()).toContain("tab=members");
});

test("a link naming the wrong tab still opens on the right one", async () => {
	// A stale link, or someone who has been upgraded since it was sent. The tab
	// in the URL is the same fact written twice, and this is the case where the
	// two disagree: the person wins.
	renderAtPath("/community?tab=guests&person=p1");
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
});

test("drops a ?person= that names nobody instead of opening an empty drawer", async () => {
	const { url } = renderAtPath("/community?person=deleted");
	// Every roster has answered and no row has that id, so the link is dead.
	// Leaving it in the URL would re-fire on every reload.
	await waitFor(() => {
		expect(url()).not.toContain("person=");
	});
	expect(screen.queryByText("alan@example.com")).toBeNull();
});

test("picking a different tab abandons the link instead of snapping back", async () => {
	const { url } = renderAtPath("/community?person=p1");
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});

	// A tab change is a change of subject: the drawer closes and the link goes
	// with it. Following the link is two steps — switch tab, then open — and a
	// click landing between them used to let the second step finish and drag
	// the board straight back to Members.
	fireEvent.click(screen.getByRole("tab", { name: "Guests" }));
	await waitFor(() => {
		expect(url()).toContain("tab=guests");
	});
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(url()).toContain("tab=guests");
	expect(url()).not.toContain("person=");
});

test("a tab picked while the link is still loading is not overruled by it", async () => {
	// The gap the previous test cannot reach: the rosters have not answered, so
	// the link knows the person but not yet the tab. Clicking here used to be
	// undone a moment later, when the rosters landed and the half-followed link
	// finished arriving on a tab the board had already left.
	shared.setLoaded(false);
	const { url } = renderAtPath("/community?person=p1");

	fireEvent.click(screen.getByRole("tab", { name: "Guests" }));
	// The router applies a `setParams` on its own queue, so wait for the tab
	// change to actually land before letting the rosters answer — otherwise the
	// two arrive together and the interleaving this test is about never happens.
	await waitFor(() => {
		expect(url()).toContain("tab=guests");
	});

	shared.setLoaded(true);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(url()).toContain("tab=guests");
	expect(url()).not.toContain("person=");
});

/** The router as the app really has it: the community console is ONE route
 *  among others, so following a link from elsewhere MOUNTS it, rather than it
 *  already being on screen with the link in the URL. Every test above starts at
 *  the destination, which is the one thing the real flow never does. */
function renderApp(start: string) {
	const history = createMemoryHistory();
	history.set({ value: start, scroll: false, replace: true });
	function Elsewhere() {
		const navigate = useNavigate();
		return (
			<button
				type="button"
				onClick={() => {
					// Exactly what the palette does on select.
					navigate("/community?person=p1");
				}}
			>
				go
			</button>
		);
	}
	const result = render(() => (
		<MemoryRouter history={history}>
			<Route path="/tasks" component={Elsewhere} />
			<Route
				path="/community"
				component={() => (
					<AbilityProvider role="board">
						<CommunityPage />
						<Elsewhere />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	return { ...result, history, url: () => history.get() };
}

test("Back from a link followed in from another page lands on the person's tab", async () => {
	// Under the window-bound Router, so the list entry the selection puts behind
	// a cold link is really written to `window.history`. That entry has to carry
	// the tab the page moved the person to, or Back closes the drawer onto
	// Applications instead of the roster they were found in.
	window.history.replaceState(null, "", "/tasks");
	function Elsewhere() {
		const navigate = useNavigate();
		return (
			<button
				type="button"
				onClick={() => {
					navigate("/community?person=p1");
				}}
			>
				go
			</button>
		);
	}
	// Code-split exactly as `communityModule` does: the page mounts after the
	// router has settled, so its effects run on a URL that is already final.
	const LazyCommunity = lazyPage(() => Promise.resolve(CommunityPage));
	render(() => (
		<Router>
			<Route path="/tasks" component={Elsewhere} />
			<Route
				path="/community"
				component={() => (
					<AbilityProvider role="board">
						<LazyCommunity />
					</AbilityProvider>
				)}
			/>
		</Router>
	));

	fireEvent.click(screen.getByRole("button", { name: "go" }));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	await waitFor(() => {
		expect(window.location.search).toContain("tab=members");
	});

	window.history.back();
	await waitFor(() => {
		expect(window.location.search).not.toContain("person=");
	});
	expect(window.location.pathname).toBe("/community");
	expect(window.location.search).toBe("?tab=members");
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});
	expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
});

test("opens the drawer when the link is followed from another page", async () => {
	const { url } = renderApp("/tasks");
	fireEvent.click(screen.getByRole("button", { name: "go" }));
	await waitFor(() => {
		expect(url()).toContain("tab=members");
	});
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
});

test("opens the drawer when the link is followed from inside the console", async () => {
	// No page mount this time: same route, new query string — and the tab the
	// board is looking at is not the one the person lives on.
	renderApp("/community?tab=guests");
	fireEvent.click(screen.getByRole("button", { name: "go" }));
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
});

test("?person=<member> with no tab mounts only the Members panel", async () => {
	// p1 lives in `members`. With no `?tab=`, the page used to resolve
	// `activeTab()` to "applications" first — mounting the Applications table —
	// then switch once the deep-link effect ran. `activeTab()` now falls back to
	// `linkedTab()`, so Members is the very first thing mounted.
	renderAtPath("/community?person=p1");
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
	// lazyMount does not even render a placeholder for a panel that has never
	// been the active tab: the whole `content-applications` element is absent,
	// not merely empty.
	expect(document.querySelector('[id$="content-applications"]')).toBeNull();
});

test("?person= while rosters load shows a skeleton and mounts no panel", async () => {
	// The rosters have not answered yet, so which tab `p1` lives in is not
	// knowable — mounting any panel now would be a guess. `awaitingLinkedTab()`
	// holds a `TableSkeleton` instead of any `Tabs.Content`.
	shared.setLoaded(false);
	renderAtPath("/community?person=p1");
	expect(document.querySelector('[role="tabpanel"] table')).toBeNull();
	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);

	// The cold-load-a-shared-link path: once the rosters answer, the skeleton
	// gives way to the Members panel — not a skeleton-then-Applications
	// flicker — and the drawer opens on it.
	shared.setLoaded(true);
	await waitFor(() => {
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});
	expect(document.querySelector("[data-skeleton-row]")).toBeNull();
	expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	// Discriminates "Members only" from "Applications, then Members": while the
	// skeleton was up, `activeTab()` had no linked tab to fall back to and read
	// as "applications" — if the four `Tabs.Content` mounted before Ark's value
	// caught up with `activeTab()`'s post-load "members", `lazyMount` would have
	// built the Applications table first, which is the exact double-build this
	// task removes, just moved to the cold-load path.
	expect(document.querySelector('[id$="content-applications"]')).toBeNull();
});

test("Back closes a drawer opened from the roster and stays on the tab", async () => {
	// The drawer owns the history entry its open pushed, so Back pops it and the
	// drawer closes — it used to leave the page, because each tab kept its own
	// copy of the selection and none of them owned an entry.
	const { history, url } = renderApp("/community?tab=members");
	fireEvent.click(await screen.findByText("Alan"));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	await waitFor(() => {
		expect(url()).toContain("person=p1");
	});

	history.back();
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});
	expect(url()).toContain("tab=members");
	expect(url()).not.toContain("person=");
});

test("the same person opens again after the drawer is closed", async () => {
	renderApp("/community?tab=guests");
	fireEvent.click(screen.getByRole("button", { name: "go" }));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});

	fireEvent.click(screen.getByRole("button", { name: /close/i }));
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});

	// The same link again: a selection that remembered the person it had just
	// dropped would treat this as already open and do nothing.
	fireEvent.click(screen.getByRole("button", { name: "go" }));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	expect(screen.getByText("alan@example.com")).toBeInTheDocument();
});

test("opening a row on a tab-less /community keeps ?person= and the drawer closes", async () => {
	// The default sidebar link carries no `?tab=`. Opening a row used to race
	// the tab-follow write against the router's own `?person=` write: the tab
	// write merged against the stale URL, dropped the person, and the drawer
	// stayed open with nothing in the URL to close.
	shared.applicants = true;
	const { url } = renderAtPath("/community");
	fireEvent.click(await screen.findByText("Zed"));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	await waitFor(() => {
		expect(url()).toContain("person=");
	});
	// Let any competing tab write land before judging the URL.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(url()).toContain("person=");

	fireEvent.click(screen.getByRole("button", { name: /close/i }));
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});
	// Back lands on the entry the open pushed over, which never had a `?tab=`
	// (the tab write replaced the person's entry, not that one). Applications is
	// what a tab-less URL shows anyway.
	expect(url()).not.toContain("person=");
	expect(screen.getByRole("tab", { name: "Applications" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
});

test("Next in the drawer does not stack history: one Back closes it", async () => {
	shared.applicants = true;
	const { history, url } = renderApp("/community?tab=applications");
	fireEvent.click(await screen.findByText("Zed"));
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	await waitFor(() => {
		expect(url()).toContain("person=a1");
	});

	const panel = openPanel()!;
	fireEvent.click(
		within(panel).getByRole("button", { name: /next/i, hidden: true })
	);
	await waitFor(() => {
		expect(url()).toContain("person=a2");
	});

	history.back();
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});
	expect(url()).toContain("tab=applications");
	expect(url()).not.toContain("person=");
});

describe("Enter on the roster", () => {
	function focusedGrid(): HTMLElement | null {
		const active = document.activeElement;
		return active instanceof HTMLElement &&
			active.getAttribute("role") === "grid"
			? active
			: null;
	}

	test("opens the first row of a tab just switched to", async () => {
		const { url } = renderAtPath("/community?tab=guests");
		await waitFor(() => {
			expect(focusedGrid()).not.toBeNull();
		});

		fireEvent.click(screen.getByRole("tab", { name: "Members" }));
		await waitFor(() => {
			expect(url()).toContain("tab=members");
		});
		// The Members table went live and claimed focus; Enter opens ITS ringed row.
		await waitFor(() => {
			expect(
				focusedGrid()?.closest('[id$="content-members"]')
			).not.toBeNull();
		});
		fireEvent.keyDown(focusedGrid()!, { key: "Enter" });
		await waitFor(() => {
			expect(openPanel()).not.toBeNull();
		});
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});

	test("reopens the same person after the drawer is closed", async () => {
		renderAtPath("/community?tab=members");
		await waitFor(() => {
			expect(focusedGrid()).not.toBeNull();
		});
		fireEvent.keyDown(focusedGrid()!, { key: "Enter" });
		await waitFor(() => {
			expect(openPanel()).not.toBeNull();
		});

		fireEvent.click(screen.getByRole("button", { name: /close/i }));
		await waitFor(() => {
			expect(openPanel()).toBeNull();
		});
		// Closing the drawer hands focus back to the table, which keeps its ring.
		await waitFor(() => {
			expect(focusedGrid()).not.toBeNull();
		});
		fireEvent.keyDown(focusedGrid()!, { key: "Enter" });
		await waitFor(() => {
			expect(openPanel()).not.toBeNull();
		});
		expect(screen.getByText("alan@example.com")).toBeInTheDocument();
	});

	test("on a button outside the table opens nothing", async () => {
		renderAtPath("/community?tab=members");
		await waitFor(() => {
			expect(focusedGrid()).not.toBeNull();
		});
		const outside = document.createElement("button");
		outside.textContent = "Topbar";
		document.body.append(outside);
		outside.focus();
		fireEvent.keyDown(outside, { key: "Enter" });
		// A real macrotask tick, so a wrongly-started open would have landed.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(openPanel()).toBeNull();
		outside.remove();
	});
});
