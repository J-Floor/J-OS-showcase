// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import styles from "./PerksPage.module.scss";
import { PerksPage } from "./PerksPage.tsx";

const { perkRows, perkSheetProps, queried } = vi.hoisted(() => ({
	perkRows: [
		{
			_id: "perk1",
			_creationTime: 0,
			partner: "Alpha Labs",
			title: "Cloud credits",
			terms: "Credits for a first project.",
			category: "cloud",
			contactId: "person1",
			contactName: "Anna Board",
			createdAt: 0,
		},
	],
	perkSheetProps: [] as Record<string, unknown>[],
	// Every query the page has subscribed to, by name, in order.
	queried: [] as string[],
}));

// Routed by the query's name: `api` refs are proxies, not `===`-stable. Only
// the perks list has rows; the requests list is empty.
const NO_REQUESTS = { requests: [], capped: false };
vi.mock("convex-solidjs", () => ({
	useQuery: (query: Parameters<typeof getFunctionName>[0]) => {
		const name = getFunctionName(query);
		queried.push(name);
		return {
			data: (): unknown => {
				if (name === "perks:listPerks") return perkRows;
				return name === "perkRequests:listPerkRequests"
					? NO_REQUESTS
					: [];
			},
			error: () => {},
			isLoading: () => false,
		};
	},
	useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

// The sheet has its own tests; a stub that records what the list hands it
// is enough to see it open and close.
vi.mock("./PerkSheet.tsx", () => ({
	PerkSheet: (props: Record<string, unknown>) => {
		perkSheetProps.push(props);
		return <div>perk-sheet</div>;
	},
}));

afterEach(() => {
	cleanup();
	perkSheetProps.length = 0;
	queried.length = 0;
});

function renderAt(path: string, role: Role) {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<PerksPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	return history;
}

function lastSheet() {
	return perkSheetProps.at(-1);
}

/** The box the perks table sits in, past `Table.Root`'s own two (its
 *  wrapper, then its scroll box), and the box around that one. */
function boxesAround(table: HTMLElement) {
	const panel = table.parentElement?.parentElement?.parentElement;
	return { panel, outer: panel?.parentElement };
}

test("the board's tabs are the page's list shell, with the perks table straight in its panel", async () => {
	renderAt("/perks", "board");
	const { panel, outer } = boxesAround(await screen.findByRole("grid"));
	// The page's own classes (each module's are its own): no shell of the
	// list's sits between the tab panel and the table.
	expect(panel).toHaveClass(styles.panel);
	expect(panel).toHaveAttribute("role", "tabpanel");
	expect(outer).toHaveClass(styles.console);
	const tabsRoot = screen
		.getByRole("tablist")
		.closest('[data-scope="tabs"][data-part="root"]');
	expect(outer).toBe(tabsRoot);
});

test("a member's perks sit in the same list shell, with no tabs", async () => {
	renderAt("/perks", "member");
	const { panel, outer } = boxesAround(await screen.findByRole("grid"));
	expect(panel).toHaveClass(styles.panel);
	expect(outer).toHaveClass(styles.console);
});

test("the board gets a Perks and a Requests tab, on Perks by default", async () => {
	renderAt("/perks", "board");
	expect(await screen.findByRole("tab", { name: "Perks" })).toHaveAttribute(
		"aria-selected",
		"true"
	);
	expect(screen.getByRole("tab", { name: "Requests" })).toHaveAttribute(
		"aria-selected",
		"false"
	);
});

test("a member gets the perks with no tab bar and no requests", async () => {
	renderAt("/perks", "member");
	expect(await screen.findByText("Cloud credits")).toBeInTheDocument();
	expect(screen.queryByRole("tablist")).toBeNull();
	expect(screen.queryByText("No requests yet")).toBeNull();
	expect(queried).not.toContain("perkRequests:listPerkRequests");
});

test("the board's visit subscribes to every request only once the Requests tab is opened", async () => {
	renderAt("/perks", "board");
	expect(await screen.findByText("Cloud credits")).toBeInTheDocument();
	expect(queried).toContain("perks:listPerks");
	expect(queried).not.toContain("perkRequests:listPerkRequests");
	fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
	expect(await screen.findByText("No requests yet")).toBeInTheDocument();
	expect(queried).toContain("perkRequests:listPerkRequests");
	// Back on Perks, the tab stays mounted: its one subscription carries on,
	// and coming back starts no other.
	fireEvent.click(screen.getByRole("tab", { name: "Perks" }));
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Perks" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Requests" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	expect(
		queried.filter((name) => name === "perkRequests:listPerkRequests")
	).toHaveLength(1);
});

test("a ?perk= link that lands on the Requests tab switches to Perks and opens it", async () => {
	const history = renderAt("/perks?tab=requests&perk=perk1", "board");
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Perks" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	await waitFor(() => {
		expect(lastSheet()?.open).toBe(true);
	});
	expect((lastSheet()?.perk as { _id: string } | undefined)?._id).toBe(
		"perk1"
	);
	expect(history.get()).toContain("tab=perks");
	expect(history.get()).toContain("perk=perk1");
});

test("picking the Requests tab by hand closes the open perk and drops ?perk=", async () => {
	const history = renderAt("/perks?perk=perk1", "board");
	await waitFor(() => {
		expect(lastSheet()?.open).toBe(true);
	});
	fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
	await waitFor(() => {
		expect(history.get()).toContain("tab=requests");
	});
	expect(history.get()).not.toContain("perk=");
	await waitFor(() => {
		expect(lastSheet()?.open).toBe(false);
	});
});
