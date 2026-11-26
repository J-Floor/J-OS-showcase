// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { VIEW_KINDS, VIEW_PAGES } from "../../convex/lib/appViews.ts";
import { entityDescriptors } from "../shell/entity/entityDescriptors.ts";
import { modules } from "../shell/registry.ts";

import { viewKeysFor } from "./viewKeys.ts";

function sorted(values: Iterable<string>): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function keys(path: string): string[] {
	const url = new URL(path, "https://app.example.com");
	return viewKeysFor(url.pathname, url.searchParams);
}

describe("viewKeysFor", () => {
	it("names the page of a module path", () => {
		expect(keys("/events")).toEqual(["page:events"]);
	});
	it("adds the entity a page's sheet param names", () => {
		expect(keys("/events?event=e1")).toEqual(["page:events", "event:e1"]);
		expect(keys("/inventory?tab=items&item=A0001")).toEqual([
			"page:inventory",
			"item:A0001",
		]);
	});
	it("adds the entity a peek names, on any page", () => {
		expect(keys("/community?open=event:e1")).toEqual([
			"page:community",
			"event:e1",
		]);
	});
	it("ignores an unknown path and an unknown peek kind", () => {
		expect(keys("/signin")).toEqual([]);
		expect(keys("/events?open=ghost:1")).toEqual(["page:events"]);
	});
	it("counts both a page sheet and a peek open over it", () => {
		expect(keys("/events?event=e1&open=person:p1")).toEqual([
			"page:events",
			"event:e1",
			"person:p1",
		]);
	});
});

describe("the backend's key lists match the app", () => {
	it("knows every module", () => {
		expect(sorted(Object.keys(VIEW_PAGES))).toEqual(
			sorted(modules.map((entry) => entry.id))
		);
	});
	it("knows every entity kind", () => {
		expect(sorted(VIEW_KINDS)).toEqual(
			sorted(entityDescriptors.map((desc) => desc.key))
		);
	});
});
