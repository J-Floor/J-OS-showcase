// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { occupancyMutate } = vi.hoisted(() => ({
	occupancyMutate: vi.fn(),
}));

// convex-solidjs's useAction throws without a ConvexProvider; stub it.
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutate: occupancyMutate }),
}));

import { OccupancyCard, POLL_INTERVAL_MS } from "./OccupancyCard.tsx";

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
	cleanup();
	occupancyMutate.mockReset();
	vi.useRealTimers();
});

it("renders nothing when occupancy is disabled", async () => {
	occupancyMutate.mockResolvedValue({ enabled: false });
	const { container } = render(() => <OccupancyCard />);
	await Promise.resolve();
	await Promise.resolve();
	expect(container).toBeEmptyDOMElement();
});

it("does not poll while occupancy is disabled", async () => {
	occupancyMutate.mockResolvedValue({ enabled: false });
	render(() => <OccupancyCard />);
	await Promise.resolve();
	await Promise.resolve();
	vi.advanceTimersByTime(3 * POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(1);
});

it("shows the gauge when a provider answers", async () => {
	occupancyMutate.mockResolvedValue({
		enabled: true,
		count: 30,
		capacity: 40,
	});
	render(() => <OccupancyCard />);
	expect(await screen.findByText("High")).toBeInTheDocument();
});

it("keeps polling once enabled", async () => {
	occupancyMutate.mockResolvedValue({
		enabled: true,
		count: 30,
		capacity: 40,
	});
	render(() => <OccupancyCard />);
	await screen.findByText("High");
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(2);
});

it("retries after a failed first call and then shows the card", async () => {
	occupancyMutate
		.mockRejectedValueOnce(new Error("network"))
		.mockResolvedValue({ enabled: true, count: 30, capacity: 40 });
	render(() => <OccupancyCard />);
	await Promise.resolve();
	await Promise.resolve();
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	expect(await screen.findByText("High")).toBeInTheDocument();
});

it("stops polling once an answer turns disabled", async () => {
	occupancyMutate
		.mockResolvedValueOnce({ enabled: true, count: 30, capacity: 40 })
		.mockResolvedValue({ enabled: false });
	const { container } = render(() => <OccupancyCard />);
	await screen.findByText("High");
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
	vi.advanceTimersByTime(3 * POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(2);
});

it("ignores a stale response that resolves after a newer disabled answer", async () => {
	let resolveStale: ((answer: unknown) => void) | undefined;
	occupancyMutate
		.mockRejectedValueOnce(new Error("network")) // initial call fails: polling starts
		.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveStale = resolve;
			})
		) // first tick hangs
		.mockResolvedValueOnce({ enabled: false }) // next tick answers disabled
		.mockResolvedValue({ enabled: true, count: 30, capacity: 40 });
	const { container } = render(() => <OccupancyCard />);
	await Promise.resolve();
	await Promise.resolve();
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(3);
	await Promise.resolve();
	await Promise.resolve();
	resolveStale?.({ enabled: true, count: 30, capacity: 40 });
	await Promise.resolve();
	await Promise.resolve();
	expect(container).toBeEmptyDOMElement();
	vi.advanceTimersByTime(3 * POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(3);
});

it("starts no polling when unmounted before the first request resolves", async () => {
	let resolveFirst: ((answer: unknown) => void) | undefined;
	occupancyMutate.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveFirst = resolve;
		})
	);
	const { unmount } = render(() => <OccupancyCard />);
	unmount();
	resolveFirst?.({ enabled: true, count: 30, capacity: 40 });
	await Promise.resolve();
	await Promise.resolve();
	vi.advanceTimersByTime(3 * POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(1);
});
