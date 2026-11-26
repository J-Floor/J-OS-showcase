// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	type MemoryHistory,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const view = {
	days: 30,
	builtAt: 1,
	summary: {
		daily: [{ date: "2026-11-25", members: 5, board: 2, guests: 1 }],
		totals: { members: 5, board: 2, guests: 1 },
		pages: [{ key: "page:events", label: "Events", count: 6 }],
		entities: [
			{ key: "event:e1", label: "Movie night", count: 4 },
			{ key: "ghost:1", label: "Unlinked", count: 1 },
		],
	},
};

vi.mock("../../../shared/data/useQuery.ts", () => ({
	useQuery: () => ({
		data: () => view,
		isStale: () => false,
		isLoading: () => false,
		error: () => {},
		refetch: () => {},
	}),
}));

import { AppViewsTab } from "./AppViewsTab.tsx";

afterEach(cleanup);

function renderTab(path = "/analytics"): MemoryHistory {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={AppViewsTab} />
		</MemoryRouter>
	));
	return history;
}

test("shows the totals and the role chart", () => {
	renderTab();
	const tiles = [...document.querySelectorAll("[data-metric-value]")].map(
		(tile) => tile.textContent
	);
	// Views (the sum), members, board, guests.
	expect(tiles).toEqual(["8", "5", "2", "1"]);
	expect(screen.getByLabelText("Daily unique views by role")).toBeVisible();
});

test("links a top page and a top item to what they count", () => {
	renderTab();
	expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
		"href",
		"/events"
	);
	expect(screen.getByRole("link", { name: "Movie night" })).toHaveAttribute(
		"href",
		"/events?event=e1"
	);
	expect(screen.queryByRole("link", { name: "Unlinked" })).toBeNull();
	expect(screen.getByText("Unlinked")).toBeVisible();
});

test("the range switch sets ?range", async () => {
	const history = renderTab();
	fireEvent.click(screen.getByText("7d"));
	await waitFor(() => {
		expect(history.get()).toContain("range=7");
	});
});
