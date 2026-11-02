// @vitest-environment happy-dom
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";

const prefetched = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("../../shared/data/queryKeeper.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../shared/data/queryKeeper.ts")
	>()),
	prefetch: (query: Parameters<typeof getFunctionName>[0]) => {
		prefetched.names.push(getFunctionName(query));
	},
}));

import { perksModule } from "./index.ts";

test("the Perks page sits at /perks, behind view Perks, under the perks icon", () => {
	expect(perksModule).toMatchObject({
		id: "perks",
		label: "Perks",
		path: "/perks",
		subject: "Perks",
		icon: "featured_seasonal_and_gifts",
	});
});

test("a visit is warmed with the perks list and the viewer's open requests", () => {
	perksModule.prefetch?.();
	expect(prefetched.names).toEqual([
		"perks:listPerks",
		"perkRequests:myOpenPerkRequests",
	]);
});
