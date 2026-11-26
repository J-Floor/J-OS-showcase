// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { entityHref, pageHref } from "./appViewsView.ts";

describe("links", () => {
	it("opens an entity's sheet on its page", () => {
		expect(entityHref("event:e1")).toBe("/events?event=e1");
		expect(entityHref("item:A0001")).toBe(
			"/inventory?tab=items&item=A0001"
		);
	});
	it("answers undefined for an unknown kind", () => {
		expect(entityHref("ghost:1")).toBeUndefined();
	});
	it("opens a perk request on the Requests tab", () => {
		expect(entityHref("request:r1")).toBe("/perks?tab=requests&request=r1");
	});
	it("answers undefined for a key without a slug", () => {
		expect(entityHref("event")).toBeUndefined();
	});
	it("opens a page", () => {
		expect(pageHref("page:events")).toBe("/events");
	});
	it("answers undefined for a key that is no page", () => {
		expect(pageHref("event:e1")).toBeUndefined();
		expect(pageHref("page:nope")).toBeUndefined();
	});
});
