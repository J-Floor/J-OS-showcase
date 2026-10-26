// @vitest-environment happy-dom
import { expect, test } from "vitest";

import type { EntityDescriptor } from "./entityDescriptor.ts";
import { parsePeek, peekValue } from "./peekParam.ts";

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

function fake(key: string, route: string, parameter: string) {
	return {
		key,
		route,
		param: parameter,
		group: key,
		icon: "widgets",
		useRows: noRows,
		label: idOf,
		ability: { action: "view", subject: "Inventory" },
	} satisfies EntityDescriptor<Row>;
}

const person = fake("person", "/community", "person");

test("peekValue joins the kind and the slug", () => {
	expect(peekValue(person, "p1")).toBe("person:p1");
});

test("parsePeek splits on the first colon", () => {
	expect(parsePeek("person:p1")).toEqual({ kind: "person", slug: "p1" });
	expect(parsePeek("item:A00012")).toEqual({ kind: "item", slug: "A00012" });
	expect(parsePeek("item:a:b")).toEqual({ kind: "item", slug: "a:b" });
});

test("parsePeek rejects a value that names no entity", () => {
	expect(parsePeek("")).toBeUndefined();
	expect(parsePeek(undefined)).toBeUndefined();
	expect(parsePeek("nocolon")).toBeUndefined();
	expect(parsePeek(":p1")).toBeUndefined();
	expect(parsePeek("person:")).toBeUndefined();
	expect(parsePeek(["person:p1"])).toBeUndefined();
});
