// @vitest-environment happy-dom
import type { CommandPaletteItem } from "@j-os/design-system";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { entityPath, type EntityDescriptor } from "./entityDescriptor.ts";
import { EntitySource } from "./EntitySource.tsx";
import { lazyPeek } from "./lazyPeek.tsx";
import { pushedOpenState } from "./pushedOpen.ts";

const navigate = vi.fn();
const setParams = vi.fn();
const location = { pathname: "/things" };

vi.mock("@solidjs/router", () => ({
	useNavigate: () => navigate,
	useLocation: () => location,
	useSearchParams: () => [{}, setParams],
}));

const prefetchModule = vi.fn();
vi.mock("../../modules/prefetchModule.ts", () => ({
	descriptorModule: (entry: { route: string }) =>
		entry.route === "/things" ? { id: "things" } : undefined,
	prefetchModule: (entry: unknown) => {
		prefetchModule(entry);
	},
}));

afterEach(() => {
	cleanup();
	navigate.mockClear();
	setParams.mockClear();
	location.pathname = "/things";
});

type Row = { _id: string; name: string };

const rowA: Row = { _id: "a1", name: "Alpha" };
const rowB: Row = { _id: "b1", name: "Bravo" };

function rowsOfBoth() {
	return [rowA, rowB];
}

/** `view`/`Inventory` is board+admin only (see `defineAbilityFor`), so this
 *  descriptor exercises a real allow/deny split across roles rather than a
 *  fabricated ability. */
const descriptor: EntityDescriptor<Row> = {
	key: "thing",
	route: "/things",
	param: "thing",
	group: "Things",
	icon: "widgets",
	useRows: () => rowsOfBoth,
	label: (row) => row.name,
	keywords: (row) => [`kw-${row._id}`],
	detail: (row) => `detail-${row._id}`,
	ability: { action: "view", subject: "Inventory" },
};

function renderSource(role: Role, emit: (items: CommandPaletteItem[]) => void) {
	render(() => (
		<AbilityProvider role={role}>
			<EntitySource descriptor={descriptor} emit={emit} />
		</AbilityProvider>
	));
}

test("an allowing ability emits one item per row, navigating to a relative path on select", async () => {
	const emit = vi.fn();
	renderSource("board", emit);

	await waitFor(() => {
		expect(emit).toHaveBeenCalled();
	});
	const items = emit.mock.calls.at(-1)?.[0] as CommandPaletteItem[];
	expect(items).toHaveLength(2);

	const itemA = items.find((item) => item.value === "thing:a1");
	expect(itemA).toMatchObject({
		label: "Alpha",
		group: "Things",
		icon: "widgets",
		keywords: ["kw-a1"],
		detail: "detail-a1",
		searchOnly: true,
	});

	itemA?.onSelect();
	// `@solidjs/router`'s `navigate` throws on a scheme-prefixed/absolute
	// target, so this must be a relative path — not entityUrl's absolute
	// output — or it would pass while crashing the real app.
	const navigatedTo = navigate.mock.calls.at(-1)?.[0] as string;
	expect(navigatedTo.startsWith("/")).toBe(true);
	expect(navigatedTo).not.toMatch(/^[a-z]+:/i);
	expect(navigatedTo).toBe(entityPath(descriptor, rowA));
});

test("a denying ability never subscribes rows and never emits", async () => {
	const emit = vi.fn();
	renderSource("member", emit);

	// Give any stray effect a tick to fire before asserting the negative.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(emit).not.toHaveBeenCalled();
});

test("onHighlight prefetches the descriptor's module and extras with the ability", async () => {
	const prefetch = vi.fn();
	const withPrefetch: EntityDescriptor<Row> = { ...descriptor, prefetch };
	const emit = vi.fn();
	render(() => (
		<AbilityProvider role="board">
			<EntitySource descriptor={withPrefetch} emit={emit} />
		</AbilityProvider>
	));
	await waitFor(() => {
		expect(emit).toHaveBeenCalled();
	});
	const items = emit.mock.calls.at(-1)?.[0] as CommandPaletteItem[];
	items.find((item) => item.value === "thing:b1")?.onHighlight?.();

	expect(prefetchModule).toHaveBeenCalledWith({ id: "things" });
	expect(prefetch).toHaveBeenCalledTimes(1);
	expect(prefetch.mock.calls[0][0]).toEqual(rowB);
	const canPerform = prefetch.mock.calls[0][1] as (
		a: string,
		s: string
	) => boolean;
	expect(canPerform("view", "Inventory")).toBe(true);
});

test("a pick on another page peeks the row over it", async () => {
	location.pathname = "/events";
	const emit = vi.fn();
	renderSource("board", emit);
	await waitFor(() => {
		expect(emit).toHaveBeenCalled();
	});
	const items = emit.mock.calls.at(-1)?.[0] as CommandPaletteItem[];
	items.find((item) => item.value === "thing:a1")?.onSelect();

	expect(setParams).toHaveBeenCalledWith(
		{ open: "thing:a1" },
		{ state: pushedOpenState("open"), replace: false }
	);
	expect(navigate).not.toHaveBeenCalled();
});

test("onHighlight preloads the descriptor's peek", async () => {
	const load = vi.fn(() => Promise.resolve(() => null));
	const peek = lazyPeek(load);
	const withPeek: EntityDescriptor<Row> = { ...descriptor, peek };
	const emit = vi.fn();
	render(() => (
		<AbilityProvider role="board">
			<EntitySource descriptor={withPeek} emit={emit} />
		</AbilityProvider>
	));
	await waitFor(() => {
		expect(emit).toHaveBeenCalled();
	});
	const items = emit.mock.calls.at(-1)?.[0] as CommandPaletteItem[];
	items.find((item) => item.value === "thing:a1")?.onHighlight?.();

	expect(load).toHaveBeenCalledTimes(1);
});
