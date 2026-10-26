// @vitest-environment happy-dom
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
} from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import type { EntityDescriptor } from "./entityDescriptor.ts";
import { useOpenEntity } from "./openEntity.ts";

afterEach(cleanup);

type Row = { _id: string };

function empty(): Row[] {
	return [];
}

function noRows() {
	return empty;
}

function idOf(row: Row) {
	return row._id;
}

const seen: { location?: ReturnType<typeof useLocation> } = {};
let pick: ReturnType<typeof useOpenEntity> | undefined;

function currentUrl(): string {
	return seen.location
		? `${seen.location.pathname}${seen.location.search}`
		: "";
}

const person: EntityDescriptor<Row> = {
	key: "person",
	route: "/community",
	param: "person",
	group: "People",
	icon: "person",
	useRows: noRows,
	label: idOf,
	ability: { action: "view", subject: "Inventory" },
};

function Page() {
	const openEntity = useOpenEntity();
	pick = openEntity;
	seen.location = useLocation();
	openEntity(person, "p1");
	return null;
}

function open(startAt: string) {
	const history = createMemoryHistory();
	history.set({ value: startAt });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={Page} />
		</MemoryRouter>
	));
	return { url: currentUrl, history };
}

test("from another page it sets the open param and keeps the other params", async () => {
	const { url } = open("/events?tab=past");
	await waitFor(() => {
		expect(url()).toBe("/events?tab=past&open=person%3Ap1");
	});
});

test("from another page it pushes an entry: Back returns to the page as it was", async () => {
	const { url, history } = open("/events?tab=past");
	await waitFor(() => {
		expect(url()).toBe("/events?tab=past&open=person%3Ap1");
	});
	history.back();
	await waitFor(() => {
		expect(url()).toBe("/events?tab=past");
	});
});

test("a pick while a peek is open replaces it: one Back leaves the peek altogether", async () => {
	const { url, history } = open("/events");
	await waitFor(() => {
		expect(url()).toBe("/events?open=person%3Ap1");
	});
	pick?.(person, "p2");
	await waitFor(() => {
		expect(url()).toBe("/events?open=person%3Ap2");
	});
	history.back();
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
});

test("on the kind's own page it navigates to the page's sheet", async () => {
	const { url } = open("/community");
	await waitFor(() => {
		expect(url()).toBe("/community?person=p1");
	});
});

test("on the kind's own page with a peek open it replaces the peek's entry: closing the sheet does not bring the peek back", async () => {
	const { url, history } = open("/community?open=task%3At1");
	await waitFor(() => {
		expect(url()).toBe("/community?person=p1");
	});
	history.back();
	await waitFor(() => {
		expect(url()).toBe("/");
	});
});
