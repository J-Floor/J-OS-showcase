// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => [],
		error: () => {},
		isLoading: () => false,
	}),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { AbilityProvider } from "../../../lib/ability.tsx";
import { PeekContext } from "../../../shared/entity/PeekContext.tsx";

import { RequestPeek } from "./RequestPeek.tsx";

const REQUEST: PerkRequestRow = {
	_id: "request1" as Id<"perkRequests">,
	perkId: "perk1" as Id<"perks">,
	personId: "person2" as Id<"people">,
	requesterName: "Ada Lovelace",
	requesterEmail: "ada@example.com",
	perkTitle: "Cloud credits",
	partner: "Acme Cloud",
	requestedAt: Date.parse("2026-10-20T09:00:00Z"),
	status: "requested",
	statusAt: Date.parse("2026-10-20T09:00:00Z"),
};

test("the peek shows the request, its status actions and the way to the Requests tab", () => {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role="board">
						<PeekContext.Provider
							value={{
								viewIn: {
									label: "View in Perk requests",
									href: "/perks?tab=requests&request=request1",
								},
							}}
						>
							<RequestPeek
								row={REQUEST}
								loading={false}
								open
								prebuild={false}
								onOpenChange={() => {}}
							/>
						</PeekContext.Provider>
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	const sheet = screen.getByRole("dialog");
	expect(
		within(sheet).getByRole("heading", { name: "Ada Lovelace" })
	).toBeInTheDocument();
	expect(
		within(sheet).getByRole("button", { name: "View in Perk requests" })
	).toBeInTheDocument();
	expect(
		within(sheet).getByRole("button", { name: /Granted/ })
	).toBeEnabled();
});
