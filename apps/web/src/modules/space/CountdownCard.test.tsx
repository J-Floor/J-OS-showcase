// @vitest-environment happy-dom
import { setDeferredImmediate } from "@j-os/design-system";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { currentPerson } = vi.hoisted(() => ({
	currentPerson: {
		value: undefined as Record<string, unknown> | null | undefined,
	},
}));

// convex-solidjs's useQuery throws "must be used within ConvexProvider" when
// rendered without a provider. Stub it out so CountdownCard renders without one.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => currentPerson.value,
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

beforeEach(() => {
	setDeferredImmediate(true);
	currentPerson.value = undefined;
});

afterEach(() => {
	cleanup();
	setDeferredImmediate(false);
});

test("shows a loading card titled Access while the person loads", () => {
	render(() => <CountdownCard />);
	expect(screen.getByText("Access")).toBeInTheDocument();
	expect(screen.getByRole("status")).toBeInTheDocument();
	expect(screen.queryByText("days left")).not.toBeInTheDocument();
});

// Members/board have no accessUntil → the card renders nothing (guest-only).
test("renders nothing when the person has no access window", () => {
	currentPerson.value = { tier: "member", stage: "active" };
	const { container } = render(() => <CountdownCard />);
	expect(container).toBeEmptyDOMElement();
});

test("shows the days left for a guest", () => {
	currentPerson.value = {
		tier: "guest",
		stage: "active",
		accessUntil: Date.now() + 3 * 86_400_000,
	};
	render(() => <CountdownCard />);
	expect(screen.getByText("days left")).toBeInTheDocument();
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
