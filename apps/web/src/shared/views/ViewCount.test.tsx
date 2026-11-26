// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider } from "../../lib/ability.tsx";

const todayQuery = vi.fn<(query: unknown, args: () => unknown) => void>();

vi.mock("../data/useQuery.ts", () => ({
	useQuery: (query: unknown, args: () => unknown) => {
		todayQuery(query, args);
		return {
			data: () => ({ members: 12, board: 4, guests: 2 }),
			isStale: () => false,
			isLoading: () => false,
			error: () => {},
			refetch: () => {},
		};
	},
}));

import { ViewCount, viewTooltip } from "./ViewCount.tsx";

afterEach(() => {
	cleanup();
	todayQuery.mockClear();
});

test("viewTooltip splits today's views by role", () => {
	expect(viewTooltip({ members: 12, board: 4, guests: 2 })).toBe(
		"Views today: 12 members · 4 board · 2 guests"
	);
});

test("the board sees the total, and the split as the trigger's label", () => {
	render(() => (
		<AbilityProvider role="board">
			<ViewCount viewKey="event:abc" />
		</AbilityProvider>
	));
	expect(screen.getByText("18")).toBeInTheDocument();
	expect(
		screen.getByRole("img", {
			name: "Views today: 12 members · 4 board · 2 guests",
		})
	).toBeInTheDocument();
	expect(todayQuery.mock.calls[0]?.[1]()).toEqual({ key: "event:abc" });
});

test("a member sees nothing and never runs the board-only query", () => {
	const { container } = render(() => (
		<AbilityProvider role="member">
			<ViewCount viewKey="event:abc" />
		</AbilityProvider>
	));
	expect(container).toBeEmptyDOMElement();
	expect(todayQuery).not.toHaveBeenCalled();
});
