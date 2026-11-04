// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type State = {
	session: { isPending: boolean; data: { user: { id: string } } | null };
	role: string | undefined;
	onboarding: { needsOnboarding: boolean } | undefined;
};

const state = vi.hoisted((): State => ({
	session: { isPending: false, data: null },
	role: undefined,
	onboarding: undefined,
}));

vi.mock("../lib/auth.ts", () => ({
	authClient: { useSession: () => () => state.session },
}));
// The real shared/data/convex builds a ConvexClient from VITE_CONVEX_URL at module
// load, which is unset under test.
vi.mock("../shared/data/convex.ts", () => ({
	convex: {},
	ottPending: () => false,
	bindConvexAuth: () => {},
}));
vi.mock("./useRole.ts", () => ({
	useRole: () => ({ data: () => state.role }),
}));
vi.mock("../shared/data/useQuery.ts", () => ({
	useQuery: () => ({ data: () => state.onboarding }),
}));
vi.mock("../shell/NoAccess.tsx", () => ({
	NoAccess: () => <p>no access</p>,
}));
vi.mock("../shell/Splash.tsx", () => ({
	Splash: () => <p>splash</p>,
}));

import { RoleGate, SPLASH_MIN_MS } from "./index.tsx";

const SIGNED_IN = { isPending: false, data: { user: { id: "person-1" } } };

beforeEach(() => {
	vi.useFakeTimers();
	state.session = { isPending: false, data: null };
	state.role = undefined;
	state.onboarding = undefined;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderGate() {
	const history = createMemoryHistory();
	history.set({ value: "/", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="/"
				component={() => (
					<RoleGate>
						<p>app</p>
					</RoleGate>
				)}
			/>
			<Route path="/signin" component={() => <p>sign in page</p>} />
			<Route
				path="/onboarding"
				component={() => <p>onboarding page</p>}
			/>
		</MemoryRouter>
	));
	return history;
}

function expectSplashOnly() {
	expect(screen.getByText("splash")).toBeInTheDocument();
	expect(screen.queryByText("app")).not.toBeInTheDocument();
	expect(screen.queryByText("no access")).not.toBeInTheDocument();
}

test("keeps the splash while the session is pending", async () => {
	state.session = { isPending: true, data: null };
	const history = renderGate();
	await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS * 2);
	expectSplashOnly();
	expect(history.get()).toBe("/");
});

test("sends a signed-out visitor to /signin without showing the app", async () => {
	const history = renderGate();
	await vi.advanceTimersByTimeAsync(0);
	expect(history.get()).toBe("/signin");
	expect(screen.getByText("sign in page")).toBeInTheDocument();
	expect(screen.queryByText("app")).not.toBeInTheDocument();
});

test("keeps the splash for a signed-in user whose role has not loaded", async () => {
	state.session = SIGNED_IN;
	state.onboarding = { needsOnboarding: false };
	const history = renderGate();
	await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS * 2);
	expectSplashOnly();
	expect(history.get()).toBe("/");
});

test("sends a user who still needs onboarding to /onboarding", async () => {
	state.session = SIGNED_IN;
	state.role = "member";
	state.onboarding = { needsOnboarding: true };
	const history = renderGate();
	await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS);
	expect(history.get()).toBe("/onboarding");
	expect(screen.getByText("onboarding page")).toBeInTheDocument();
	expect(screen.queryByText("app")).not.toBeInTheDocument();
});

test("shows no-access for a signed-in user without an access tier", async () => {
	state.session = SIGNED_IN;
	state.role = "none";
	state.onboarding = { needsOnboarding: false };
	renderGate();
	await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS);
	expect(screen.getByText("no access")).toBeInTheDocument();
	expect(screen.queryByText("app")).not.toBeInTheDocument();
});

test("renders the app for an access tier once the splash minimum has passed", async () => {
	state.session = SIGNED_IN;
	state.role = "member";
	state.onboarding = { needsOnboarding: false };
	const history = renderGate();
	await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS - 1);
	expectSplashOnly();
	await vi.advanceTimersByTimeAsync(1);
	expect(screen.getByText("app")).toBeInTheDocument();
	expect(screen.queryByText("splash")).not.toBeInTheDocument();
	expect(history.get()).toBe("/");
});
