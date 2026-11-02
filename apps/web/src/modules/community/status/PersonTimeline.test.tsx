// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

// Property 4 (timeline renders events / gives a sensible empty state) needs
// `PersonTimeline` itself mounted, which calls `useQuery` — stub it out (as
// CountdownCard.test.tsx and MembersTab.test.tsx already do) so it renders
// without a ConvexProvider, with data supplied per test through a shared ref.
// Declared before the import below so `vi.mock`'s hoist lands above it.
const { queryDataRef } = vi.hoisted(() => ({
	queryDataRef: { current: undefined as unknown[] | undefined },
}));

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => queryDataRef.current,
		isLoading: () => false,
		error: () => {},
	}),
}));

import type { Id } from "../../../../convex/_generated/dataModel";

import { PersonTimeline } from "./PersonTimeline.tsx";

function row(over: Record<string, unknown>): Record<string, unknown> {
	return { _id: "e1", at: 1_800_000_000_000, kind: "transition", ...over };
}

describe("PersonTimeline", () => {
	afterEach(() => {
		cleanup();
		queryDataRef.current = undefined;
	});

	it("renders the person's events", () => {
		queryDataRef.current = [
			row({ kind: "door", after: "force_off", actorName: "Sara" }),
		];
		render(() => <PersonTimeline personId={"p1" as Id<"people">} />);
		expect(
			screen.getByText("Door access blocked by the board")
		).toBeInTheDocument();
	});

	it("shows a skeleton list, not Loading text, while events load", () => {
		queryDataRef.current = undefined;
		render(() => <PersonTimeline personId={"p1" as Id<"people">} />);
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByText(/loading…/i)).toBeNull();
	});

	it("shows something sensible, not an empty box, for a person with no events", () => {
		queryDataRef.current = [];
		render(() => <PersonTimeline personId={"p1" as Id<"people">} />);
		expect(screen.getByText("No history yet")).toBeInTheDocument();
	});
});
