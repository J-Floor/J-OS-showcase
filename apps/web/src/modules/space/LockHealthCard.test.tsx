// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

/** The door-health reading the mocked action resolves. Held in a holder so a
 *  test can swap it before rendering without re-mocking the module. */
const health: { value: unknown; calls: number; fail: boolean } = {
	calls: 0,
	fail: false,
	value: {
		configured: 2,
		unavailable: [{ name: "Upstairs" }],
		locks: [
			{ name: "Downstairs", online: true },
			{ name: "Upstairs", online: false },
		],
	},
};

vi.mock("convex-solidjs", () => ({
	useAction: () => ({
		mutateAsync: () => {
			health.calls++;
			return health.fail
				? Promise.reject(new Error("provider down"))
				: Promise.resolve(health.value);
		},
	}),
}));

import { LockHealthCard } from "./LockHealthCard.tsx";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	health.calls = 0;
	health.fail = false;
	setVisibility("visible");
});

function setVisibility(state: DocumentVisibilityState) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}

// The card's own job: take what the action returns, summarise it, and render
// the count + the offline detail. (The summary rules themselves are covered in
// lockHealth.test.ts; this proves the card is wired to them.)
test("renders the fetched online count and names an offline door", async () => {
	render(() => <LockHealthCard />);
	expect(await screen.findByText("1/2")).toBeInTheDocument();
	expect(screen.getByText(/Upstairs offline —/)).toBeInTheDocument();
	expect(screen.getByText("Doors")).toBeInTheDocument();
	expect(screen.getByText("Downstairs online")).toBeInTheDocument();
	expect(screen.getByText("Upstairs offline")).toBeInTheDocument();
});

test("re-checks the doors every minute while on screen", async () => {
	vi.useFakeTimers();
	render(() => <LockHealthCard />);
	expect(health.calls).toBe(1);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(health.calls).toBe(2);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(health.calls).toBe(3);
});

test("skips the poll while the page is hidden and re-checks on return", async () => {
	vi.useFakeTimers();
	render(() => <LockHealthCard />);
	setVisibility("hidden");
	await vi.advanceTimersByTimeAsync(180_000);
	expect(health.calls).toBe(1);
	setVisibility("visible");
	await vi.advanceTimersByTimeAsync(0);
	expect(health.calls).toBe(2);
});

test("stops polling once unmounted", async () => {
	vi.useFakeTimers();
	const { unmount } = render(() => <LockHealthCard />);
	unmount();
	await vi.advanceTimersByTimeAsync(180_000);
	expect(health.calls).toBe(1);
});

test("a failed re-check shows the error state instead of the old reading", async () => {
	vi.useFakeTimers();
	render(() => <LockHealthCard />);
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.getByText("1/2")).toBeInTheDocument();
	health.fail = true;
	await vi.advanceTimersByTimeAsync(60_000);
	expect(screen.getByText("Couldn't reach the locks.")).toBeInTheDocument();
	expect(screen.queryByText("1/2")).not.toBeInTheDocument();
	expect(screen.queryByText("Downstairs online")).not.toBeInTheDocument();
});
