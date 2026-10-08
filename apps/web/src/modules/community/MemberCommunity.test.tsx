// @vitest-environment happy-dom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ isLoading: () => false, data: () => null }),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));

// jsdom gaps ark Tabs touches at mount (syncs the sliding indicator via
// ResizeObserver).
if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import { MemberCommunity } from "./MemberCommunity.tsx";

describe("MemberCommunity", () => {
	it("renders both tab triggers", () => {
		render(() => <MemberCommunity />);
		expect(screen.getByText("My profile")).toBeInTheDocument();
		expect(screen.getByText("Board contacts")).toBeInTheDocument();
	});
});
