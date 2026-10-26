// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
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

import type { Doc } from "../../../convex/_generated/dataModel";
import { AbilityProvider } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";
import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { eventsEntity } from "./entity.ts";
import { EventPeek } from "./EventPeek.tsx";

const event = {
	_id: "event1",
	_creationTime: 0,
	name: "Open House",
	startsAt: Date.parse("2026-10-01T18:00:00Z"),
	endsAt: Date.parse("2026-10-01T20:00:00Z"),
	startsAtLocal: "2026-10-01T20:00:00+02:00[Europe/Zurich]",
	endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
	createdBy: "person1",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
} as unknown as Doc<"events">;

function renderPeek(onOpenChange: () => void) {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<ConfirmProvider>
						<AbilityProvider role="board">
							<PeekContext.Provider
								value={{
									viewIn: {
										label: "View in Events",
										href: "/events?event=event1",
									},
								}}
							>
								<EventPeek
									row={event}
									loading={false}
									open
									prebuild={false}
									onOpenChange={onOpenChange}
								/>
							</PeekContext.Provider>
						</AbilityProvider>
					</ConfirmProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("the descriptor has a peek", () => {
	expect(eventsEntity.peek).toBeDefined();
});

test("the peek shows the event, a View in button and no prev/next", async () => {
	renderPeek(() => {});
	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Open House" })
		).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "View in Events" })
	).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /previous|next/i })).toBeNull();
});

test("closing the sheet calls onOpenChange(false)", async () => {
	const onOpenChange = vi.fn();
	renderPeek(onOpenChange);
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: /close/i })
		).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: /close/i }));
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
