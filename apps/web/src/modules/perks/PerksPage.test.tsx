// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// Convex's `api` is a proxy whose refs aren't `===`-stable, so the stub routes
// by the query's name. `queryState.perks` serves `listPerks`; `undefined`
// models the query still loading. Any other query gets no rows.
const queryState = vi.hoisted(() => ({
	perks: (): unknown[] | undefined => [],
}));
const NO_REQUESTS = { requests: [], capped: false };
vi.mock("convex-solidjs", () => ({
	useQuery: (query: unknown) => {
		const name = getFunctionName(
			query as Parameters<typeof getFunctionName>[0]
		);
		return {
			data: (): unknown => {
				if (name === "perks:listPerks") return queryState.perks();
				return name === "perkRequests:listPerkRequests"
					? NO_REQUESTS
					: [];
			},
			error: () => {},
			isLoading: () => false,
		};
	},
	// The perk sheet under the table sends requests through it.
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { PerksPage } from "./PerksPage.tsx";

const base = {
	_creationTime: 0,
	terms: "Ask the board for the code.",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
};
const openEnded = {
	...base,
	_id: "perk1",
	partner: "Alpha Labs",
	title: "Cloud credits",
	category: "cloud",
};
const current = {
	...base,
	_id: "perk2",
	partner: "Bravo Labs",
	title: "Design seats",
	category: "software",
	validUntil: "2999-12-31",
};
const expired = {
	...base,
	_id: "perk3",
	partner: "Charlie Labs",
	title: "Legal hours",
	category: "legal",
	validUntil: "2020-01-31",
};

const [rows, setRows] = createSignal<unknown[] | undefined>([
	openEnded,
	current,
	expired,
]);
queryState.perks = rows;

afterEach(() => {
	setRows([openEnded, current, expired]);
});

// Inside a router, as the app renders every module page.
function renderAs(role: Role) {
	return render(() => (
		<MemoryRouter>
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
}

test("a member sees the perks on offer, under Active, and no expired one", () => {
	renderAs("member");
	expect(screen.getByText("Cloud credits")).toBeInTheDocument();
	expect(screen.getByText("Design seats")).toBeInTheDocument();
	expect(screen.getByText("Active")).toBeInTheDocument();
	expect(screen.queryByText("Legal hours")).toBeNull();
	expect(screen.queryByText("Expired")).toBeNull();
});

test("the board sees Active and Expired groups", () => {
	renderAs("board");
	expect(screen.getByText("Active")).toBeInTheDocument();
	expect(screen.getByText("Expired")).toBeInTheDocument();
	expect(screen.getByText("Legal hours")).toBeInTheDocument();
});

test("a perk with no end date says so in its row", () => {
	renderAs("member");
	expect(screen.getByText("No end date")).toBeInTheDocument();
});

test("lists perks by partner, A to Z, whatever order the query sends", () => {
	setRows([current, { ...expired, validUntil: undefined }, openEnded]);
	renderAs("board");
	expect(
		screen.getAllByText(/Labs$/).map((element) => element.textContent)
	).toEqual(["Alpha Labs", "Bravo Labs", "Charlie Labs"]);
});

test("a live update adds and removes rows", () => {
	renderAs("member");
	setRows([openEnded, { ...current, _id: "perk4", title: "Hiring board" }]);
	expect(screen.getByText("Hiring board")).toBeInTheDocument();
	expect(screen.queryByText("Design seats")).toBeNull();
});

test("shows a loading skeleton while perks are undefined, not the empty state", () => {
	setRows(undefined);
	renderAs("member");
	expect(screen.queryByText("No perks yet")).toBeNull();
	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);
});

test("shows the empty state once perks resolve with no rows", () => {
	setRows([]);
	renderAs("board");
	expect(screen.getByText("No perks yet")).toBeInTheDocument();
	expect(document.querySelectorAll("[data-skeleton-row]")).toHaveLength(0);
});

test("a member whose perks have all expired sees the empty state", () => {
	setRows([expired]);
	renderAs("member");
	expect(screen.getByText("No perks yet")).toBeInTheDocument();
});

test("does not render a redundant page title", () => {
	renderAs("board");
	expect(screen.queryByRole("heading", { name: /^Perks$/ })).toBeNull();
});

test("a member gets no New perk button and no floating toolbar", () => {
	renderAs("member");
	expect(screen.queryByRole("button", { name: /New perk/ })).toBeNull();
	// An empty toolbar would still float over the page.
	expect(document.querySelector('[data-part="floating-toolbar"]')).toBeNull();
});

test("board: New perk sits in the tab bar on the Perks tab, and Download CSV takes its place on Requests", async () => {
	renderAs("board");
	// In the tab bar, not a toolbar of its own: the Perks panel stays mounted
	// behind the Requests tab, and on a phone its toolbar would float there.
	const newPerk = await screen.findByRole("button", { name: /New perk/ });
	expect(newPerk.closest('[data-part="tab-bar"]')).not.toBeNull();
	fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
	await waitFor(() => {
		expect(screen.queryByRole("button", { name: /New perk/ })).toBeNull();
	});
	const download = await screen.findByRole("button", {
		name: "Download CSV",
	});
	expect(download.closest('[data-part="tab-bar"]')).not.toBeNull();
});

test("board: New perk opens the create sheet", async () => {
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /New perk/ }));
	expect(
		await screen.findByRole("dialog", { name: "New perk" })
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /^Create/ })).toBeInTheDocument();
});
