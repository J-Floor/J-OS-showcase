// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// `listPerks` answers with `listed.perks`, `myOpenPerkRequests` with
// `listed.open`, and every other query with none. Routed by the query's
// name: Convex's `api` refs are proxies, not `===`-stable.
const listed = vi.hoisted(() => ({
	perks: [] as unknown[],
	open: [] as unknown[],
}));
vi.mock("convex-solidjs", () => ({
	useQuery: (query: FunctionReference<"query">) => ({
		data: () => {
			switch (getFunctionName(query)) {
				case "perks:listPerks": {
					return listed.perks;
				}
				case "perkRequests:myOpenPerkRequests": {
					return listed.open;
				}
				default: {
					return [];
				}
			}
		},
		error: () => {},
		isLoading: () => false,
	}),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { AbilityProvider } from "../../lib/ability.tsx";
import { formatDateIn } from "../../shared/time.ts";

import { PerksList } from "./PerksList.tsx";

const base = {
	_creationTime: 0,
	terms: "Up to 5,000 credits in the first year.",
	contactId: "person1",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
	contactName: "Grace Hopper",
	contactFirstName: "Grace",
};

listed.perks = [
	{
		...base,
		_id: "perk1",
		partner: "Northwind Cloud",
		title: "Hosting credits",
		category: "cloud",
		validUntil: "2099-12-31",
	},
	{
		...base,
		_id: "perk2",
		partner: "Example Print",
		title: "Business cards",
		category: "marketing",
		validUntil: "2020-01-31",
	},
];

const requestedAt = Date.parse("2026-10-20T09:00:00Z");

afterEach(() => {
	listed.open = [];
});

// MemoryRouter: the list deep-links the open perk through `?perk=`.
function renderList(history = createMemoryHistory()) {
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role="member">
						<PerksList />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	return history;
}

test("clicking a perk opens its sheet", async () => {
	renderList();
	fireEvent.click(screen.getAllByText("Hosting credits")[0]);
	expect(
		await screen.findByRole("dialog", { name: "Hosting credits" })
	).toBeInTheDocument();
});

test("a ?perk= link (a request email, a shared URL) opens the sheet", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/perks?perk=perk1", replace: true });
	renderList(history);
	expect(
		await screen.findByRole("dialog", { name: "Hosting credits" })
	).toBeInTheDocument();
});

test("closing the sheet with its Close button clears ?perk=", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/perks", scroll: false, replace: true });
	renderList(history);
	fireEvent.click(screen.getAllByText("Hosting credits")[0]);
	await screen.findByRole("dialog", { name: "Hosting credits" });
	expect(history.get()).toContain("perk=perk1");

	fireEvent.click(screen.getByRole("button", { name: /close/i }));

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(history.get()).not.toContain("perk=");
});

test("a member keeps an expired perk in view while their request on it is open", async () => {
	listed.open = [{ perkId: "perk2", requestedAt }];
	renderList();
	expect(screen.getByText("Expired")).toBeInTheDocument();
	fireEvent.click(screen.getAllByText("Business cards")[0]);
	expect(
		await screen.findByRole("dialog", { name: "Business cards" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", {
			name: `Requested on ${formatDateIn(requestedAt, SITE_TIMEZONE)}`,
		})
	).toBeDisabled();
});

test("with no request open on it, a member does not see an expired perk", () => {
	renderList();
	expect(screen.getAllByText("Hosting credits")[0]).toBeInTheDocument();
	expect(screen.queryByText("Business cards")).toBeNull();
	expect(screen.queryByText("Expired")).toBeNull();
});

test("on its own the list offers no New perk, even to the board; the opener it hands over opens the create sheet", async () => {
	let openCreate: (() => void) | undefined;
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role="board">
						<PerksList
							openCreateRef={(open) => {
								openCreate = open;
							}}
						/>
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	expect(screen.getAllByText("Hosting credits")[0]).toBeInTheDocument();
	// The button is the board page's, in its tab bar (PerksPage.test.tsx).
	expect(screen.queryByRole("button", { name: /New perk/ })).toBeNull();
	if (!openCreate) throw new Error("the list handed over no opener");
	openCreate();
	expect(
		await screen.findByRole("dialog", { name: "New perk" })
	).toBeInTheDocument();
});
