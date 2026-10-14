import type { ConvexClient } from "convex/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";

import {
	LINGER_TTL,
	MAX_KEPT,
	PREFETCH_TTL,
	bindQueryKeeper,
	keptCount,
	prefetch,
	prefetchSpec,
	releaseAll,
	retain,
	setKeeperActive,
} from "./queryKeeper.ts";

function fakeClient() {
	const unsubscribes: ReturnType<typeof vi.fn>[] = [];
	const onUpdate = vi.fn(() => {
		const unsub = vi.fn();
		unsubscribes.push(unsub);
		return unsub;
	});
	return {
		client: { disabled: false, onUpdate } as unknown as ConvexClient,
		onUpdate,
		unsubscribes,
	};
}

describe("queryKeeper", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setKeeperActive(true);
	});
	afterEach(() => {
		setKeeperActive(false);
		bindQueryKeeper(undefined);
		vi.useRealTimers();
	});

	it("prefetchSpec subscribes the spec's query with the row's args", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		prefetchSpec(
			{
				query: api.events.listEventAttendees,
				args: (eventId: string) => ({ eventId: eventId as never }),
			},
			"e1"
		);
		expect(fake.onUpdate).toHaveBeenCalledWith(
			api.events.listEventAttendees,
			{ eventId: "e1" },
			expect.any(Function),
			expect.any(Function)
		);
		vi.advanceTimersByTime(PREFETCH_TTL);
		expect(keptCount()).toBe(0);
	});

	it("is a no-op with no bound client", () => {
		retain(api.events.listEvents, {}, LINGER_TTL);
		expect(keptCount()).toBe(0);
	});

	it("ignores retain while inactive", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		setKeeperActive(false);
		retain(api.events.listEvents, {}, LINGER_TTL);
		expect(fake.onUpdate).not.toHaveBeenCalled();
		expect(keptCount()).toBe(0);
	});

	it("going inactive releases everything held", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		retain(api.events.listEvents, {}, LINGER_TTL);
		setKeeperActive(false);
		expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
		expect(keptCount()).toBe(0);
	});

	it("subscribes once per key and releases after the ttl", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		retain(api.events.listEvents, {}, LINGER_TTL);
		retain(api.events.listEvents, {}, LINGER_TTL);
		expect(fake.onUpdate).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(LINGER_TTL);
		expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
		expect(keptCount()).toBe(0);
	});

	it("a second retain extends the hold, never shortens it", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		retain(api.events.listEvents, {}, LINGER_TTL);
		prefetch(api.events.listEvents, {});
		vi.advanceTimersByTime(PREFETCH_TTL);
		expect(fake.unsubscribes[0]).not.toHaveBeenCalled();
		vi.advanceTimersByTime(LINGER_TTL - PREFETCH_TTL);
		expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
	});

	it("different args are different keys", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		retain(
			api.inventory.listItemsByType,
			{ typeId: "a" as never },
			LINGER_TTL
		);
		retain(
			api.inventory.listItemsByType,
			{ typeId: "b" as never },
			LINGER_TTL
		);
		expect(fake.onUpdate).toHaveBeenCalledTimes(2);
	});

	it("releases the least recently retained key past MAX_KEPT", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		for (let index = 0; index <= MAX_KEPT; index++)
			retain(
				api.inventory.listItemsByType,
				{ typeId: String(index) as never },
				LINGER_TTL
			);
		expect(keptCount()).toBe(MAX_KEPT);
		expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
	});

	it("releaseAll and rebinding drop every subscription", () => {
		const fake = fakeClient();
		bindQueryKeeper(fake.client);
		retain(api.events.listEvents, {}, LINGER_TTL);
		releaseAll();
		expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
		retain(api.events.listEvents, {}, LINGER_TTL);
		bindQueryKeeper(undefined);
		expect(fake.unsubscribes[1]).toHaveBeenCalledTimes(1);
	});

	it("skips a disabled client", () => {
		const fake = fakeClient();
		(fake.client as unknown as { disabled: boolean }).disabled = true;
		bindQueryKeeper(fake.client);
		retain(api.events.listEvents, {}, LINGER_TTL);
		expect(fake.onUpdate).not.toHaveBeenCalled();
	});
});
