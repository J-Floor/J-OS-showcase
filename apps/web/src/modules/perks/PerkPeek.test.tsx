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

import type { PerkRow } from "../../../convex/perks.ts";
import { AbilityProvider } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";
import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { perksEntity } from "./entity.ts";
import { PerkPeek } from "./PerkPeek.tsx";

const perk = {
	_id: "perk1",
	_creationTime: 0,
	partner: "Northwind Cloud",
	title: "Hosting credits",
	terms: "Up to 5,000 credits in the first year.",
	category: "cloud",
	contactId: "person1",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
	contactName: "Grace Hopper",
} as unknown as PerkRow;

function renderPeek(onOpenChange: () => void) {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<ConfirmProvider>
						<AbilityProvider role="member">
							<PeekContext.Provider
								value={{
									viewIn: {
										label: "View in Perks",
										href: "/perks?perk=perk1",
									},
								}}
							>
								<PerkPeek
									row={perk}
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
	expect(perksEntity.peek).toBeDefined();
});

test("the peek shows the perk, its Request button, a View in button and no prev/next", async () => {
	renderPeek(() => {});
	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Hosting credits" })
		).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Request perk" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "View in Perks" })
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
