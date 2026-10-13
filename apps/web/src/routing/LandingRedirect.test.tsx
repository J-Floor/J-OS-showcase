// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const stored = vi.hoisted((): { lastPath: string | null } => ({
	lastPath: "/tasks",
}));
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => stored.lastPath }),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));
// routing/index imports these; the real lib/convex builds a ConvexClient from
// VITE_CONVEX_URL at module load, which is unset under test.
vi.mock("../lib/convex.ts", () => ({
	convex: {},
	ottPending: () => false,
	bindConvexAuth: () => undefined,
}));
vi.mock("../lib/auth.ts", () => ({ authClient: {} }));

import { modules } from "../modules/registry.ts";

import { LandingRedirect } from "./index.tsx";

afterEach(() => {
	cleanup();
	stored.lastPath = "/tasks";
});

test("sends / to the first module when no path is stored", async () => {
	stored.lastPath = null;
	const first = modules[0].path;
	const history = createMemoryHistory();
	history.set({ value: "/", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="/" component={LandingRedirect} />
			<Route path={first} component={() => <p>first page</p>} />
		</MemoryRouter>
	));
	expect(await screen.findByText("first page")).toBeInTheDocument();
	expect(history.get()).toBe(first);
});

test("keeps the query string (e.g. ?notifications=open) when sending / to the last page", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/?notifications=open", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="/" component={LandingRedirect} />
			<Route path="/tasks" component={() => <p>tasks page</p>} />
		</MemoryRouter>
	));
	expect(await screen.findByText("tasks page")).toBeInTheDocument();
	expect(history.get()).toBe("/tasks?notifications=open");
	expect(screen.queryByText(/Carry the query/)).not.toBeInTheDocument();
});
