// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { sampleSummary } from "../../../convex/lib/fakeWebAnalyticsProvider.ts";

const NOW = Date.UTC(2026, 10, 10, 12);

vi.mock("../../shared/data/useQuery.ts", () => ({
	useQuery: () => ({
		data: () => ({
			days: 30,
			configured: true,
			snapshot: { fetchedAt: NOW, summary: sampleSummary() },
		}),
		isStale: () => false,
		isLoading: () => false,
		error: () => {},
		refetch: () => {},
	}),
}));

vi.mock("convex-solidjs", () => ({
	useAction: () => ({
		mutateAsync: vi.fn().mockResolvedValue({ kind: "refreshed" }),
	}),
}));

import { AnalyticsPage } from "./AnalyticsPage.tsx";

afterEach(cleanup);

function renderPage(path: string): void {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={AnalyticsPage} />
		</MemoryRouter>
	));
}

test("opens on the App tab when no tab is in the URL", () => {
	renderPage("/analytics");
	expect(screen.getByRole("tab", { name: "App" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(screen.getByRole("tab", { name: "Website" })).toHaveAttribute(
		"aria-selected",
		"false"
	);
	// Hidden panels stay mounted in Ark; the Website tab must not be.
	expect(
		screen.queryByRole("heading", { name: "Pages" })
	).not.toBeInTheDocument();
});

test("shows the Website tab's content for ?tab=website", async () => {
	renderPage("/analytics?tab=website");
	expect(screen.getByRole("tab", { name: "Website" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(
		await screen.findByRole("heading", { name: "Pages" })
	).toBeInTheDocument();
});
