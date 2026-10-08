// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

// convex-solidjs's useQuery throws "must be used within ConvexProvider" when
// rendered without a provider. Stub it out so CountdownCard renders without one.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
	}),
	useAction: () => ({
		mutate: vi.fn(),
		isLoading: () => false,
		data: () => undefined,
		error: () => undefined,
	}),
}));

import { CountdownCard } from "./CountdownCard.tsx";

afterEach(cleanup);

// Without a ConvexProvider the query returns undefined → no accessUntil → the
// card renders nothing (guest-only gating). Members/board hit this same path.
test("renders nothing when there is no access window", () => {
	render(() => <CountdownCard />);
	expect(screen.queryByText("days left")).not.toBeInTheDocument();
});
