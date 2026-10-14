// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const rosters: {
	members: unknown[] | undefined;
	guests: unknown[] | undefined;
	applications: unknown[] | undefined;
	boardLevel: unknown[] | undefined;
} = {
	members: undefined,
	guests: undefined,
	applications: undefined,
	boardLevel: [],
};

function query(read: () => unknown[] | undefined) {
	return {
		data: read,
		isLoading: () => read() === undefined,
		error: () => {},
		isStale: () => false,
		refetch: () => {},
	};
}

vi.mock("../data/communityData.tsx", () => ({
	useMembers: () => query(() => rosters.members),
	useGuests: () => query(() => rosters.guests),
	useApplications: () => query(() => rosters.applications),
}));

vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => query(() => rosters.boardLevel),
}));

import { InsightsTab } from "./InsightsTab.tsx";

const EMPTY_COPY = [
	"No guest windows are set to close.",
	"No guests are hosted yet.",
	"Nothing to show yet.",
];

afterEach(() => {
	rosters.members = undefined;
	rosters.guests = undefined;
	rosters.applications = undefined;
	rosters.boardLevel = [];
});

function tileValues(container: HTMLElement): Element[] {
	return [...container.querySelectorAll("[data-metric-value]")];
}

function isSkeleton(element: Element): boolean {
	return element.querySelector("[aria-hidden='true']") !== null;
}

function chartFigure(caption: string): HTMLElement {
	const figure = screen.getByText(caption).closest("figure");
	if (!figure) throw new Error(`no figure for ${caption}`);
	return figure;
}

test("rosters loading: every tile value and chart area is a skeleton, no empty copy", () => {
	const { container } = render(() => <InsightsTab />);
	expect(tileValues(container).length).toBeGreaterThan(0);
	expect(tileValues(container).every((element) => isSkeleton(element))).toBe(
		true
	);
	const figures = screen.getAllByRole("figure");
	expect(figures.length).toBeGreaterThan(0);
	expect(figures.every((element) => isSkeleton(element))).toBe(true);
	for (const copy of EMPTY_COPY) {
		expect(container).not.toHaveTextContent(copy);
	}
});

test("one roster still loading: tiles and charts wait for it", () => {
	rosters.members = [];
	rosters.applications = [];
	const { container } = render(() => <InsightsTab />);
	expect(tileValues(container).every((element) => isSkeleton(element))).toBe(
		true
	);
	expect(
		screen.getAllByRole("figure").every((element) => isSkeleton(element))
	).toBe(true);
});

test("board list loading: only the hosting chart waits", () => {
	rosters.members = [];
	rosters.guests = [];
	rosters.applications = [];
	rosters.boardLevel = undefined;
	const { container } = render(() => <InsightsTab />);
	expect(tileValues(container).some((element) => isSkeleton(element))).toBe(
		false
	);
	expect(isSkeleton(chartFigure("Who is hosting"))).toBe(true);
	expect(isSkeleton(chartFigure("Applications received"))).toBe(false);
});

test("rosters loaded: tiles show real numbers and no skeletons remain", () => {
	rosters.members = [];
	rosters.guests = [];
	rosters.applications = [];
	const { container } = render(() => <InsightsTab />);
	expect(container.querySelector("[aria-hidden='true']")).toBeNull();
	expect(tileValues(container).length).toBeGreaterThan(0);
	for (const value of tileValues(container)) {
		expect(value.textContent.trim()).toMatch(/^\d+$/);
	}
});

test("no verticals: the card stays, with its empty state", () => {
	rosters.members = [];
	rosters.guests = [];
	rosters.applications = [];
	render(() => <InsightsTab />);
	expect(chartFigure("What the floor is building")).toHaveTextContent(
		"No one has picked a vertical yet."
	);
});
