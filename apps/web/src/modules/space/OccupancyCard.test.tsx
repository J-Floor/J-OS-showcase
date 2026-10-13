// @vitest-environment happy-dom
import { setDeferredImmediate } from "@j-os/design-system";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { occupancyMutate } = vi.hoisted(() => ({
	occupancyMutate: vi.fn(),
}));

// convex-solidjs's useAction throws without a ConvexProvider; stub it.
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutate: occupancyMutate }),
}));

import { clearAnswers, lastAnswer } from "../../shared/data/lastAnswer.ts";
import { setKeeperActive } from "../../shared/data/queryKeeper.ts";

import { OccupancyCard, POLL_INTERVAL_MS } from "./OccupancyCard.tsx";

beforeEach(() => {
	setKeeperActive(true);
	setDeferredImmediate(true);
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
	cleanup();
	clearAnswers();
	setKeeperActive(false);
	setDeferredImmediate(false);
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

it("shows a loading card until the first answer lands", () => {
	occupancyMutate.mockReturnValue(new Promise(() => undefined));
	render(() => <OccupancyCard />);
	expect(screen.getByText("Occupancy")).toBeInTheDocument();
	expect(screen.queryByText("High")).not.toBeInTheDocument();
	expect(screen.getByRole("status")).toBeInTheDocument();
});

it("steps aside when the first call fails with nothing remembered, and keeps polling", async () => {
	occupancyMutate.mockRejectedValue(new Error("network"));
	const { container } = render(() => <OccupancyCard />);
	await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
	vi.advanceTimersByTime(POLL_INTERVAL_MS);
	expect(occupancyMutate).toHaveBeenCalledTimes(2);
});

it("replaces the loading card with the gauge on an enabled answer", async () => {
	occupancyMutate.mockResolvedValue({
		enabled: true,
		count: 30,
		capacity: 40,
	});
	render(() => <OccupancyCard />);
	expect(screen.getByText("Occupancy")).toBeInTheDocument();
	expect(await screen.findByText("High")).toBeInTheDocument();
});

it("removes the loading card on a disabled answer", async () => {
	occupancyMutate.mockResolvedValue({ enabled: false });
	const { container } = render(() => <OccupancyCard />);
	expect(screen.getByText("Occupancy")).toBeInTheDocument();
	await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
});

it("a second mount after an enabled answer shows the gauge before the action resolves", async () => {
	occupancyMutate.mockResolvedValueOnce({
		enabled: true,
		count: 30,
		capacity: 40,
	});
	const first = render(() => <OccupancyCard />);
	await screen.findByText("High");
	first.unmount();
	occupancyMutate.mockReturnValue(new Promise(() => undefined));
	render(() => <OccupancyCard />);
	expect(screen.getByText("High")).toBeInTheDocument();
});

it("remembers an answer for the next mount", async () => {
	occupancyMutate.mockResolvedValue({
		enabled: true,
		count: 30,
		capacity: 40,
	});
	render(() => <OccupancyCard />);
	await screen.findByText("High");
	expect(lastAnswer("occupancy", POLL_INTERVAL_MS)).toEqual({
		enabled: true,
		count: 30,
		capacity: 40,
	});
});

it("does not remember an answer that lands after unmount", async () => {
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
	expect(lastAnswer("occupancy", POLL_INTERVAL_MS)).toBeUndefined();
});

it("does not remember an answer that lands after the session ended", async () => {
	let resolveFirst: ((answer: unknown) => void) | undefined;
	occupancyMutate.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveFirst = resolve;
		})
	);
	render(() => <OccupancyCard />);
	setKeeperActive(false);
	resolveFirst?.({ enabled: true, count: 30, capacity: 40 });
	await screen.findByText("High");
	expect(lastAnswer("occupancy", POLL_INTERVAL_MS)).toBeUndefined();
});
