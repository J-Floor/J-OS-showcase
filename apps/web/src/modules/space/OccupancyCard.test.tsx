// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { OccupancyAnswer } from "../../../convex/occupancy.ts";

const [answer, setAnswer] = createSignal<OccupancyAnswer | undefined>();
const [error, setError] = createSignal<Error | undefined>();

const useQuery = vi.hoisted(() => vi.fn());

vi.mock("../../shared/data/useQuery.ts", () => ({ useQuery }));

import { OccupancyCard } from "./OccupancyCard.tsx";

useQuery.mockImplementation(() => ({ data: answer, error }));

afterEach(() => {
	cleanup();
	setAnswer(undefined);
	setError(undefined);
});

it("subscribes to the stored count", () => {
	render(() => <OccupancyCard />);
	expect(useQuery).toHaveBeenCalled();
	const reference = useQuery.mock.lastCall?.[0] as FunctionReference<"query">;
	expect(getFunctionName(reference)).toBe(
		getFunctionName(api.occupancy.current)
	);
});

it("shows a loading card until the first answer lands", () => {
	render(() => <OccupancyCard />);
	expect(screen.getByText("Occupancy")).toBeInTheDocument();
	expect(screen.queryByText("High")).not.toBeInTheDocument();
	expect(screen.getByRole("status")).toBeInTheDocument();
});

it("renders nothing when occupancy is disabled", () => {
	setAnswer({ enabled: false });
	const { container } = render(() => <OccupancyCard />);
	expect(container).toBeEmptyDOMElement();
});

it("renders nothing when the query fails", () => {
	setError(new Error("network"));
	const { container } = render(() => <OccupancyCard />);
	expect(container).toBeEmptyDOMElement();
});

it("renders nothing when a later read fails, even with an earlier answer", () => {
	setAnswer({ enabled: true, count: 30, capacity: 40 });
	setError(new Error("network"));
	const { container } = render(() => <OccupancyCard />);
	expect(container).toBeEmptyDOMElement();
});

it("shows Low for an empty space", () => {
	setAnswer({ enabled: true, count: 0, capacity: 40 });
	render(() => <OccupancyCard />);
	expect(screen.getByText("Low")).toBeInTheDocument();
});

it("shows the gauge level when a provider answers", () => {
	setAnswer({ enabled: true, count: 30, capacity: 40 });
	render(() => <OccupancyCard />);
	expect(screen.getByText("High")).toBeInTheDocument();
});

it("shows Unknown when there is no reading", () => {
	setAnswer({ enabled: true, count: null, capacity: 40 });
	render(() => <OccupancyCard />);
	expect(screen.getByText("Unknown")).toBeInTheDocument();
});

it("follows the query as the count changes", () => {
	setAnswer({ enabled: true, count: 30, capacity: 40 });
	render(() => <OccupancyCard />);
	expect(screen.getByText("High")).toBeInTheDocument();
	setAnswer({ enabled: true, count: 5, capacity: 40 });
	expect(screen.getByText("Low")).toBeInTheDocument();
	expect(screen.queryByText("High")).not.toBeInTheDocument();
});
