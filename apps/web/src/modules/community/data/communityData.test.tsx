// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { beforeEach, expect, it, vi } from "vitest";

import { api } from "../../../../convex/_generated/api";

const useQuery = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("../../../shared/data/useQuery.ts", () => ({
	useQuery: (...args: unknown[]) => useQuery(...args),
}));

const data = await import("./communityData.tsx");

beforeEach(() => {
	useQuery.mockReset().mockReturnValue({ data: vi.fn() });
});

it("each roster hook subscribes its own query on mount", () => {
	createRoot((dispose) => {
		data.useApplications();
		data.useMembers();
		data.useGuests();
		dispose();
	});
	expect(useQuery.mock.calls).toEqual([
		[api.applications.list, {}],
		[api.people.listMembers, {}],
		[api.people.listGuests, {}],
	]);
});
