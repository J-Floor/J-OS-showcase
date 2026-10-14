// @vitest-environment happy-dom
import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexProvider } from "convex-solidjs";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { api } from "../../../convex/_generated/api";

import { bindQueryKeeper, keptCount, setKeeperActive } from "./queryKeeper.ts";
import { useQuery } from "./useQuery.ts";

/**
 * The keeper only helps if its subscription opens BEFORE convex-solidjs's own
 * unsubscribe runs. If the inner one goes first the ref-count hits 0, Convex
 * drops the result and the keeper pays a fresh round trip. Mocks cannot see
 * that, so this uses the real convex-solidjs and the real keeper.
 */
function fakeClient() {
	const counts = new Map<string, number>();
	const minAfterFirst = new Map<string, number>();
	function keyOf(
		query: Parameters<ConvexClient["onUpdate"]>[0],
		args: unknown
	) {
		return getFunctionName(query) + JSON.stringify(args);
	}
	const client = {
		disabled: false,
		client: { localQueryResult: () => {} },
		onUpdate(
			query: Parameters<ConvexClient["onUpdate"]>[0],
			args: unknown
		) {
			const key = keyOf(query, args);
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			if (!minAfterFirst.has(key)) minAfterFirst.set(key, next);
			return () => {
				const after = (counts.get(key) ?? 0) - 1;
				counts.set(key, after);
				minAfterFirst.set(
					key,
					Math.min(minAfterFirst.get(key) ?? after, after)
				);
			};
		},
	};
	return { client: client as unknown as ConvexClient, minAfterFirst };
}

function mount<T>(client: ConvexClient, body: () => T) {
	return createRoot((dispose) => {
		let value!: T;
		ConvexProvider({
			client,
			get children() {
				value = body();
				return null;
			},
		});
		return { value, dispose };
	});
}

describe("useQuery handoff to the keeper", () => {
	afterEach(() => {
		setKeeperActive(false);
		bindQueryKeeper(undefined);
	});

	it("unmount keeps the server subscription alive", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		setKeeperActive(true);
		const mounted = mount(fake.client, () =>
			useQuery(api.events.listEvents, {})
		);
		mounted.dispose();
		expect(
			fake.minAfterFirst.get(
				getFunctionName(api.events.listEvents) + "{}"
			)
		).toBeGreaterThanOrEqual(1);
		expect(keptCount()).toBe(1);
	});

	it("changing args keeps the previous args subscribed", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		setKeeperActive(true);
		const [id, setId] = createSignal("a");
		const mounted = mount(fake.client, () =>
			useQuery(api.events.listEventAttendees, () => ({
				eventId: id() as never,
			}))
		);
		setId("b");
		const key =
			getFunctionName(api.events.listEventAttendees) +
			JSON.stringify({ eventId: "a" });
		expect(fake.minAfterFirst.get(key)).toBeGreaterThanOrEqual(1);
		expect(keptCount()).toBe(1);
		mounted.dispose();
	});
});
