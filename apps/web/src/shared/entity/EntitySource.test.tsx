// @vitest-environment happy-dom
import type { CommandPaletteItem } from "@j-os/design-system";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { entityPath, type EntityDescriptor } from "./entityDescriptor.ts";
import { EntitySource } from "./EntitySource.tsx";

const navigate = vi.fn();

vi.mock("@solidjs/router", () => ({
	useNavigate: () => navigate,
}));

afterEach(() => {
	cleanup();
	navigate.mockClear();
});

type Row = { _id: string; name: string };

const rowA: Row = { _id: "a1", name: "Alpha" };
const rowB: Row = { _id: "b1", name: "Bravo" };

/** `view`/`Inventory` is board+admin only (see `defineAbilityFor`), so this
 *  descriptor exercises a real allow/deny split across roles rather than a
 *  fabricated ability. */
const descriptor: EntityDescriptor<Row> = {
	key: "thing",
	route: "/things",
	param: "thing",
	group: "Things",
	icon: "widgets",
	useRows: () => () => [rowA, rowB],
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
