// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";

import { GlobalSearch } from "./GlobalSearch.tsx";

type Row = { _id: string; name: string };

/** The setter for each source's rows. The signals are made in the mock
 *  factory, on the solid-js instance the components use. */
const shared = vi.hoisted(() => ({
	setEvents: vi.fn() as (rows: Row[] | undefined) => void,
	setItems: vi.fn() as (rows: Row[] | undefined) => void,
}));

vi.mock("../entity/entityDescriptors.ts", async () => {
	const { createSignal } = await import("solid-js");
	function source(
		key: string,
		ability: EntityDescriptor<Row>["ability"]
	): [EntityDescriptor<Row>, (rows: Row[] | undefined) => void] {
		const [rows, setRows] = createSignal<Row[]>();
		return [
			{
				key,
				route: `/${key}`,
				param: key,
				group: key,
				icon: "widgets",
				useRows: () => rows,
				label: (row) => row.name,
				ability,
			},
			setRows,
		];
	}
	// Every member views events; only the board views the inventory.
	const [events, setEvents] = source("event", {
		action: "view",
		subject: "Events",
	});
	const [items, setItems] = source("item", {
		action: "view",
		subject: "Inventory",
	});
	shared.setEvents = setEvents;
	shared.setItems = setItems;
	return { entityDescriptors: [events, items] };
});

const LOADING = "Loading…";
const NO_MATCH = "Nothing matches that.";

beforeEach(() => {
	shared.setEvents(undefined);
	shared.setItems(undefined);
});
afterEach(cleanup);

/** Opens the palette as `role` and searches for `query`. */
async function search(role: Role, query: string) {
	const history = createMemoryHistory();
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<GlobalSearch />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	fireEvent.click(screen.getByRole("textbox", { name: "Search" }));
	fireEvent.input(await screen.findByRole("combobox"), {
		target: { value: query },
	});
}

test("says it is loading until every source has answered, then that nothing matches", async () => {
	await search("board", "zzzz");
	expect(await screen.findByText(LOADING)).toBeInTheDocument();
	expect(screen.queryByText(NO_MATCH)).toBeNull();

	shared.setEvents([{ _id: "e1", name: "Talk" }]);
	expect(screen.getByText(LOADING)).toBeInTheDocument();

	shared.setItems([]);
	expect(screen.getByText(NO_MATCH)).toBeInTheDocument();
	expect(screen.queryByText(LOADING)).toBeNull();
});

test("shows a match once its source answers", async () => {
	await search("board", "projector");
	expect(await screen.findByText(LOADING)).toBeInTheDocument();

	shared.setItems([{ _id: "i1", name: "Projector" }]);
	await waitFor(() => {
		expect(
			screen.getByRole("option", { name: "Projector" })
		).toBeInTheDocument();
	});
	expect(screen.queryByText(LOADING)).toBeNull();
});

test("a source the role cannot view does not keep it loading", async () => {
	shared.setEvents([]);
	await search("member", "zzzz");
	expect(await screen.findByText(NO_MATCH)).toBeInTheDocument();
	expect(screen.queryByText(LOADING)).toBeNull();
});
