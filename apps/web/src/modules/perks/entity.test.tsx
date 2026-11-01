// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import { For, Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

const prefetch =
	vi.fn<(query: FunctionReference<"query">, args: unknown) => void>();
vi.mock("../../shared/data/queryKeeper.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../shared/data/queryKeeper.ts")
	>()),
	prefetchSpec: (
		spec: {
			query: FunctionReference<"query">;
			args: (key: unknown) => unknown;
		},
		key: unknown
	) => {
		prefetch(spec.query, spec.args(key));
	},
}));

// What `listPerks` and `myOpenPerkRequests` answer; `undefined` models a
// list still loading. Routed by the query's name: Convex's `api` refs are
// proxies, not `===`-stable.
const listed = vi.hoisted(() => ({
	rows: [] as unknown[] | undefined,
	open: [] as unknown[] | undefined,
}));
vi.mock("convex-solidjs", () => ({
	useQuery: (query: FunctionReference<"query">) => ({
		data: () => {
			switch (getFunctionName(query)) {
				case "perks:listPerks": {
					return listed.rows;
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

import type { PerkRow } from "../../../convex/perks.ts";
import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { entityPath } from "../../shared/entity/entityDescriptor.ts";

import { perksEntity, prefetchPerkSheet } from "./entity.ts";

const running = {
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

afterEach(() => {
	listed.rows = [];
	listed.open = [];
});

const ended = {
	...running,
	_id: "perk2",
	partner: "Example Print",
	title: "Business cards",
	validUntil: "2020-01-31",
} as unknown as PerkRow;

test("names a perk by its title, with its partner beside it and in its keywords", () => {
	expect(perksEntity.label(running)).toBe("Hosting credits");
	expect(perksEntity.detail?.(running)).toBe("Northwind Cloud");
	expect(perksEntity.keywords?.(running)).toEqual(["Northwind Cloud"]);
});

test("links to the perk's sheet on the perks page", () => {
	expect(entityPath(perksEntity, running)).toBe("/perks?perk=perk1");
});

test("prefetches the perk's request list for a viewer who manages perks", () => {
	prefetch.mockClear();
	perksEntity.prefetch?.(
		running,
		(action, subject) => action === "manage" && subject === "Perks"
	);
	expect(
		prefetch.mock.calls.map(([query, args]) => [
			getFunctionName(query),
			args,
		])
	).toEqual([["perkRequests:listRequestsForPerk", { perkId: "perk1" }]]);
});

test("prefetches nothing for a viewer who cannot manage perks", () => {
	prefetch.mockClear();
	perksEntity.prefetch?.(running, (action) => action === "view");
	expect(prefetch).not.toHaveBeenCalled();
});

test("prefetchPerkSheet warms the one list the board's sheet reads, as the Requests tab's hover does", () => {
	prefetch.mockClear();
	prefetchPerkSheet("perk2" as PerkRow["_id"]);
	expect(
		prefetch.mock.calls.map(([query, args]) => [
			getFunctionName(query),
			args,
		])
	).toEqual([["perkRequests:listRequestsForPerk", { perkId: "perk2" }]]);
});

function ListedPerks() {
	const rows = perksEntity.useRows();
	return (
		<Show when={rows()} fallback={<p>Loading</p>}>
			{(loaded) => (
				<ul>
					<For each={loaded()}>
						{(perk) => <li>{perksEntity.label(perk)}</li>}
					</For>
				</ul>
			)}
		</Show>
	);
}

function renderRows(role: Role) {
	render(() => (
		<AbilityProvider role={role}>
			<ListedPerks />
		</AbilityProvider>
	));
}

test("a member's rows (palette, peek) leave out perks that have ended", () => {
	listed.rows = [running, ended];
	renderRows("member");
	expect(screen.getByText("Hosting credits")).toBeInTheDocument();
	expect(screen.queryByText("Business cards")).toBeNull();
});

test("a member's rows keep an ended perk they have a request open on", () => {
	listed.rows = [running, ended];
	listed.open = [{ perkId: "perk2", requestedAt: 0 }];
	renderRows("member");
	expect(screen.getByText("Hosting credits")).toBeInTheDocument();
	expect(screen.getByText("Business cards")).toBeInTheDocument();
});

test("the rows wait for the viewer's open requests, so a link to an ended perk they asked for is not dropped", () => {
	listed.rows = [running, ended];
	listed.open = undefined;
	renderRows("member");
	expect(screen.getByText("Loading")).toBeInTheDocument();
	expect(screen.queryByText("Hosting credits")).toBeNull();
});

test("the board's rows keep perks that have ended", () => {
	listed.rows = [running, ended];
	renderRows("board");
	expect(screen.getByText("Hosting credits")).toBeInTheDocument();
	expect(screen.getByText("Business cards")).toBeInTheDocument();
});
