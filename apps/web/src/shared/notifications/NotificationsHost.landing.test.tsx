// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import type { ParentProps } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => ({ lastPath: "/tasks" }) }),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../lib/convex.ts", () => ({
	convex: {},
	ottPending: () => false,
	bindConvexAuth: () => undefined,
}));
vi.mock("../../lib/auth.ts", () => ({ authClient: {} }));
vi.mock("../../lib/push.ts", () => ({
	resyncPush: () => Promise.resolve(),
}));
vi.mock("./NotificationsDrawer.tsx", () => ({
	NotificationsDrawer: (p: { open: boolean }) => (
		<div data-testid="drawer" data-open={String(p.open)} />
	),
}));

import { LandingRedirect } from "../../routing/index.tsx";

import { NotificationsHost } from "./NotificationsHost.tsx";
import { setNotificationsOpen } from "./notificationsState.ts";

afterEach(() => {
	cleanup();
	setNotificationsOpen(false);
});

// The shell mounts the Host above the routed page, exactly like this.
function Shell(props: ParentProps) {
	return (
		<>
			{props.children}
			<NotificationsHost />
		</>
	);
}

test("/?notifications=open ends on the landing page with the drawer open", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/?notifications=open", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="/" component={Shell}>
				<Route path="/" component={LandingRedirect} />
				<Route
					path="/tasks"
					component={() => <p>tasks page</p>}
					info={{ title: "Tasks" }}
				/>
			</Route>
		</MemoryRouter>
	));
	expect(await screen.findByText("tasks page")).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByTestId("drawer").dataset.open).toBe("true");
	});
	await waitFor(() => {
		expect(history.get()).toMatch(/^\/tasks\??$/);
	});
});

test("an unknown URL redirects too, and still ends with the drawer open", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/nope?notifications=open", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="/" component={Shell}>
				<Route
					path="/tasks"
					component={() => <p>tasks page</p>}
					info={{ title: "Tasks" }}
				/>
				<Route path="*" component={LandingRedirect} />
			</Route>
		</MemoryRouter>
	));
	expect(await screen.findByText("tasks page")).toBeInTheDocument();
	await waitFor(() => {
		expect(screen.getByTestId("drawer").dataset.open).toBe("true");
	});
});
