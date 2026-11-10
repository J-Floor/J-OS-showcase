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
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { sampleSummary } from "../../../convex/lib/fakeWebAnalyticsProvider.ts";
import type { SnapshotView } from "../../../convex/websiteAnalytics.ts";

const NOW = Date.UTC(2026, 10, 10, 12);
const MINUTE = 60_000;

const [view, setView] = createSignal<SnapshotView>();
const state: { refresh: ReturnType<typeof vi.fn> } = { refresh: vi.fn() };

// Signal-backed, like the real hook: the page reads `data()` reactively, so a
// new snapshot reaches it the way a pushed query result does.
vi.mock("../../shared/data/useQuery.ts", () => ({
	useQuery: () => ({
		data: view,
		isStale: () => false,
		isLoading: () => view() === undefined,
		error: () => {},
		refetch: () => {},
	}),
}));

vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync: state.refresh }),
}));

import { WebsitePage } from "./WebsitePage.tsx";

beforeEach(() => {
	vi.setSystemTime(NOW);
	setView(undefined);
	state.refresh = vi.fn().mockResolvedValue({ kind: "refreshed" });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

/** A promise the test rejects when it chooses. */
function rejectLater() {
	const rejecters: ((error: Error) => void)[] = [];
	const promise = new Promise<never>((_resolve, rejecter) => {
		rejecters.push(rejecter);
	});
	return {
		promise,
		reject(error: Error) {
			rejecters[0]?.(error);
		},
	};
}

function renderPage(path = "/website"): MemoryHistory {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={WebsitePage} />
		</MemoryRouter>
	));
	return history;
}

function tileValues(): string[] {
	return [...document.querySelectorAll("[data-metric-value]")].map(
		(element) => element.textContent
	);
}

test("shows tiles, chart and breakdowns from a snapshot", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 4 * MINUTE, summary: sampleSummary() },
	});
	renderPage();
	expect(await screen.findByText("120")).toBeInTheDocument();
	// Views, visits, views per visit, top country: 80 also sits in the devices
	// list, so the tiles are read as a group.
	expect(tileValues()).toEqual(["120", "80", "1.5", "Switzerland"]);
	// Tile plus the Countries row; the API's codes never reach the screen.
	expect(screen.getAllByText("Switzerland")).toHaveLength(2);
	expect(screen.getByText("Germany")).toBeInTheDocument();
	expect(screen.queryByText("CH")).not.toBeInTheDocument();
	for (const title of [
		"Pages",
		"Referrers",
		"Countries",
		"Devices",
		"Browsers",
		"OS",
	])
		expect(
			screen.getByRole("heading", { name: title })
		).toBeInTheDocument();
	expect(screen.getByText("Refreshed 4m ago")).toBeInTheDocument();
});

test("hints that a sampled range is an estimate, and only then", async () => {
	setView({
		days: 90,
		configured: true,
		snapshot: {
			fetchedAt: NOW - 4 * MINUTE,
			summary: { ...sampleSummary(), sampleInterval: 10 },
		},
	});
	renderPage("/website?range=90");
	expect(
		await screen.findByText(/sampled 1 in 10 page views/)
	).toBeInTheDocument();
	cleanup();
	setView({
		days: 90,
		configured: true,
		snapshot: { fetchedAt: NOW - 4 * MINUTE, summary: sampleSummary() },
	});
	renderPage("/website?range=90");
	expect(await screen.findByText("120")).toBeInTheDocument();
	expect(screen.queryByText(/sampled 1 in/)).not.toBeInTheDocument();
});

test("refresh button calls the action for the current range", async () => {
	setView({
		days: 7,
		configured: true,
		snapshot: { fetchedAt: NOW - 4 * MINUTE, summary: sampleSummary() },
	});
	renderPage("/website?range=7");
	fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
	expect(state.refresh).toHaveBeenCalledWith({ days: 7 });
});

test("auto-refreshes once when the snapshot is stale", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 20 * MINUTE, summary: sampleSummary() },
	});
	renderPage();
	await waitFor(() => {
		expect(state.refresh).toHaveBeenCalledTimes(1);
	});
	expect(state.refresh).toHaveBeenCalledWith({ days: 30 });
});

test("does not auto-refresh a fresh snapshot", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - MINUTE, summary: sampleSummary() },
	});
	renderPage();
	await screen.findByText("120");
	expect(state.refresh).not.toHaveBeenCalled();
});

test("shows the failure notice and keeps the data", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: {
			fetchedAt: NOW - 120 * MINUTE,
			summary: sampleSummary(),
			lastError: { at: NOW - MINUTE, kind: "rateLimited" },
		},
	});
	renderPage();
	expect(
		await screen.findByText(
			"Couldn't refresh (rate limit). Showing data from 2h ago."
		)
	).toBeInTheDocument();
	expect(screen.getByText("120")).toBeInTheDocument();
});

test("shows the not-connected state", async () => {
	setView({ days: 30, configured: false, snapshot: null });
	renderPage();
	expect(
		await screen.findByText("Website analytics not connected")
	).toBeInTheDocument();
	expect(state.refresh).not.toHaveBeenCalled();
});

test("the range segment writes ?range=", async () => {
	setView({ days: 30, configured: true, snapshot: null });
	const history = renderPage();
	fireEvent.click(await screen.findByRole("radio", { name: "90d" }));
	await waitFor(() => {
		expect(history.get()).toContain("range=90");
	});
});

test("a refused refresh shows a notice instead of crashing", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 4 * MINUTE, summary: sampleSummary() },
	});
	state.refresh.mockRejectedValue(new Error("Forbidden"));
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
	expect(await screen.findByText("Couldn't refresh.")).toBeInTheDocument();
	expect(screen.getByText("120")).toBeInTheDocument();
});

test("does not auto-refresh on the previous range's snapshot", async () => {
	// The query keeps serving the old range's answer while its arguments
	// change: the page is on 7 days, the answer is still the 30-day one.
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 20 * MINUTE, summary: sampleSummary() },
	});
	renderPage("/website?range=7");
	await screen.findByText("120");
	expect(state.refresh).not.toHaveBeenCalled();
	// The 7-day answer arrives stale: now it refreshes, for 7 days.
	setView({
		days: 7,
		configured: true,
		snapshot: { fetchedAt: NOW - 20 * MINUTE, summary: sampleSummary() },
	});
	await waitFor(() => {
		expect(state.refresh).toHaveBeenCalledTimes(1);
	});
	expect(state.refresh).toHaveBeenCalledWith({ days: 7 });
});

test("a refresh that lands a still-stale snapshot does not refresh again", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 20 * MINUTE, summary: sampleSummary() },
	});
	renderPage();
	await waitFor(() => {
		expect(state.refresh).toHaveBeenCalledTimes(1);
	});
	setView({
		days: 30,
		configured: true,
		snapshot: {
			fetchedAt: NOW - 20 * MINUTE,
			summary: sampleSummary(),
			lastError: { at: NOW, kind: "network" },
		},
	});
	// Still stale, so only the guard keeps it from asking again.
	await screen.findByText(
		"Couldn't refresh (network). Showing data from 20m ago."
	);
	expect(state.refresh).toHaveBeenCalledTimes(1);
});

test("a refresh failing after a range switch leaves no notice on the new range", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 20 * MINUTE, summary: sampleSummary() },
	});
	const pending = rejectLater();
	state.refresh.mockReturnValue(pending.promise);
	const history = renderPage();
	await waitFor(() => {
		expect(state.refresh).toHaveBeenCalledTimes(1);
	});
	fireEvent.click(await screen.findByRole("radio", { name: "90d" }));
	await waitFor(() => {
		expect(history.get()).toContain("range=90");
	});
	setView({
		days: 90,
		configured: true,
		snapshot: { fetchedAt: NOW - MINUTE, summary: sampleSummary() },
	});
	pending.reject(new Error("Forbidden"));
	await waitFor(() => {
		expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
	});
	expect(screen.queryByText("Couldn't refresh.")).not.toBeInTheDocument();
});

test("labels how long ago the snapshot was refreshed", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: {
			fetchedAt: NOW - 7 * MINUTE,
			attemptedAt: NOW - 7 * MINUTE,
			summary: sampleSummary(),
		},
	});
	renderPage();
	expect(await screen.findByText("Refreshed 7m ago")).toBeInTheDocument();
});

test("the refresh button shows its loading state while the action is pending", async () => {
	setView({
		days: 30,
		configured: true,
		snapshot: { fetchedAt: NOW - 4 * MINUTE, summary: sampleSummary() },
	});
	const pending = rejectLater();
	state.refresh.mockReturnValue(pending.promise);
	renderPage();
	expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
	fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
	expect(
		await screen.findByRole("status", { name: "Loading" })
	).toBeInTheDocument();
	pending.reject(new Error("Forbidden"));
	await waitFor(() => {
		expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
	});
});
