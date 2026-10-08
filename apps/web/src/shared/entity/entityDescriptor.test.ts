// @vitest-environment happy-dom
import { expect, test } from "vitest";

import type { EntityDescriptor } from "./entityDescriptor.ts";
import { entityPath, entityUrl, slugOf } from "./entityDescriptor.ts";

type EventRow = {
	_id: string;
};

type ItemRow = {
	_id: string;
	assetTag: string;
};

const eventDescriptor: EntityDescriptor<EventRow> = {
	key: "event",
	route: "/events",
	param: "event",
	group: "Events",
	icon: "calendar",
	useRows: () => () => undefined,
	label: (row) => row._id,
	ability: { action: "view", subject: "Events" },
};

const itemDescriptor: EntityDescriptor<ItemRow> = {
	key: "item",
	route: "/inventory",
	param: "item",
	group: "Inventory",
	icon: "box",
	useRows: () => () => undefined,
	label: (row) => row.assetTag,
	slug: (row) => row.assetTag,
	tab: "items",
	ability: { action: "view", subject: "Inventory" },
};

test("entityUrl builds an absolute deep link with a single search param", () => {
	const row: EventRow = { _id: "evt123" };

	expect(entityUrl(eventDescriptor, row)).toBe(
		`${window.location.origin}/events?event=evt123`
	);
});

test("entityUrl emits the static tab param before the entity param, using the row's slug", () => {
	const row: ItemRow = {
		_id: "internal-id-that-changes",
		assetTag: "A00001",
	};

	expect(entityUrl(itemDescriptor, row)).toBe(
		`${window.location.origin}/inventory?tab=items&item=A00001`
	);
});

test("entityPath builds a relative path (no origin) with a single search param", () => {
	const row: EventRow = { _id: "evt123" };

	const path = entityPath(eventDescriptor, row);
	expect(path).toBe("/events?event=evt123");
	expect(path.startsWith("/events")).toBe(true);
	expect(path).not.toContain("http");
	expect(entityUrl(eventDescriptor, row)).toBe(
		`${window.location.origin}${path}`
	);
});

test("entityPath emits the static tab param before the entity param, using the row's slug, as a relative path", () => {
	const row: ItemRow = {
		_id: "internal-id-that-changes",
		assetTag: "A00001",
	};

	const path = entityPath(itemDescriptor, row);
	expect(path).toBe("/inventory?tab=items&item=A00001");
	expect(path.startsWith("/inventory")).toBe(true);
	expect(path).not.toContain("http");
	expect(entityUrl(itemDescriptor, row)).toBe(
		`${window.location.origin}${path}`
	);
});

test("slugOf defaults to row._id when the descriptor has no slug fn", () => {
	const row: EventRow = { _id: "evt123" };

	expect(slugOf(eventDescriptor, row)).toBe("evt123");
});

test("slugOf uses the descriptor's slug fn when provided", () => {
	const row: ItemRow = {
		_id: "internal-id-that-changes",
		assetTag: "A00001",
	};

	expect(slugOf(itemDescriptor, row)).toBe("A00001");
});
