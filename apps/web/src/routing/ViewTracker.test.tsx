// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const recordView = vi.hoisted(() =>
	vi.fn<(args: { key: string }) => Promise<null>>(() => Promise.resolve(null))
);
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => null }),
	useMutation: () => ({ mutateAsync: recordView }),
}));
// routing/index imports these; the real shared/data/convex builds a ConvexClient from
// VITE_CONVEX_URL at module load, which is unset under test.
vi.mock("../shared/data/convex.ts", () => ({
	convex: {},
	ottPending: () => false,
	bindConvexAuth: () => {},
}));
vi.mock("../lib/auth.ts", () => ({ authClient: {} }));

import { ViewTracker } from "./index.tsx";

beforeEach(() => recordView.mockClear());
afterEach(cleanup);

function mount(start: string) {
	const history = createMemoryHistory();
	history.set({ value: start, replace: true });
	render(() => (
		<MemoryRouter
			history={history}
			root={(props) => (
				<>
					<ViewTracker />
					{props.children}
				</>
			)}
		>
			<Route path="*" component={() => null} />
		</MemoryRouter>
	));
	return history;
}

function sent() {
	return recordView.mock.calls.map((call) => call[0]);
}
function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test("sends only the keys the last location did not show", async () => {
	const history = mount("/events");
	await tick();
	expect(sent()).toEqual([{ key: "page:events" }]);
	history.set({ value: "/events?event=e1" });
	await tick();
	expect(sent()).toEqual([{ key: "page:events" }, { key: "event:e1" }]);
});

test("a change that keeps the same keys sends nothing", async () => {
	const history = mount("/events?event=e1");
	await tick();
	recordView.mockClear();
	history.set({ value: "/events?event=e1&tab=x" });
	await tick();
	expect(sent()).toEqual([]);
});

test("a key that leaves and comes back is sent again", async () => {
	const history = mount("/events?event=e1");
	await tick();
	recordView.mockClear();
	history.set({ value: "/events" });
	await tick();
	expect(sent()).toEqual([]);
	history.set({ value: "/events?event=e1" });
	await tick();
	expect(sent()).toEqual([{ key: "event:e1" }]);
});
