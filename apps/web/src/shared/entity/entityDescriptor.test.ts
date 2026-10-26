// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { defineAbilityFor } from "../../lib/ability.tsx";

import type { EntityDescriptor } from "./entityDescriptor.ts";
import {
	canView,
	descriptorForLink,
	entityPath,
	entityUrl,
	slugOf,
} from "./entityDescriptor.ts";

type EventRow = {
	_id: string;
};

type ItemRow = {
	_id: string;
	assetTag: string;
};

function noRows(): undefined {
	return;
}

const eventDescriptor: EntityDescriptor<EventRow> = {
	key: "event",
	route: "/events",
	param: "event",
	group: "Events",
	icon: "calendar",
	useRows: () => noRows,
	label: (row) => row._id,
	ability: { action: "view", subject: "Events" },
};

const itemDescriptor: EntityDescriptor<ItemRow> = {
	key: "item",
	route: "/inventory",
	param: "item",
	group: "Inventory",
	icon: "box",
	useRows: () => noRows,
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

test("canView follows the viewer's ability on the descriptor's subject", () => {
	expect(canView(defineAbilityFor("board"), itemDescriptor)).toBe(true);
	expect(canView(defineAbilityFor("none"), itemDescriptor)).toBe(false);
});

const taskDescriptor: EntityDescriptor<EventRow> = {
	...eventDescriptor,
	key: "task",
	route: "/tasks",
	param: "task",
};

test("descriptorForLink finds the kind a page link names", () => {
	const descriptors = [eventDescriptor, taskDescriptor];
	expect(descriptorForLink("/events?event=e1", descriptors)).toEqual({
		desc: eventDescriptor,
		slug: "e1",
	});
	expect(descriptorForLink("/tasks?task=t1", descriptors)).toEqual({
		desc: taskDescriptor,
		slug: "t1",
	});
});

test("descriptorForLink returns nothing for a page that holds no single entity", () => {
	const descriptors = [eventDescriptor, taskDescriptor];
	expect(
		descriptorForLink("/space?tab=diagnostics", descriptors)
	).toBeUndefined();
	expect(descriptorForLink("/", descriptors)).toBeUndefined();
	expect(descriptorForLink("/events?task=x", descriptors)).toBeUndefined();
});

test("descriptorForLink resolves an absolute link on its path", () => {
	expect(
		descriptorForLink("https://example.com/events?event=e1", [
			eventDescriptor,
		])
	).toEqual({ desc: eventDescriptor, slug: "e1" });
});
