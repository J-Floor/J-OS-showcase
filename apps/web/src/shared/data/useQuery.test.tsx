// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";

const convexUseQuery = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("convex-solidjs", () => ({
	useQuery: (...args: unknown[]) => convexUseQuery(...args),
}));
const retain = vi.fn<(...args: unknown[]) => void>();
vi.mock("./queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("./queryKeeper.ts")>()),
	retain: (...args: unknown[]) => {
		retain(...args);
	},
}));

import { LINGER_TTL } from "./queryKeeper.ts";
import { useQuery } from "./useQuery.ts";

function resolveOptions(): Record<string, unknown> {
	const options = convexUseQuery.mock.calls[0][2] as () => Record<
		string,
		unknown
	>;
	return options();
}

describe("useQuery", () => {
	beforeEach(() => {
		convexUseQuery.mockReset().mockReturnValue({ data: () => {} });
		retain.mockReset();
	});

	it("defaults keepPreviousData and lets callers override it", () => {
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {});
			dispose();
		});
		expect(resolveOptions().keepPreviousData).toBe(true);
		convexUseQuery.mockClear();
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {}, { keepPreviousData: false });
			dispose();
		});
		expect(resolveOptions().keepPreviousData).toBe(false);
	});

	it("retains the query for LINGER_TTL when its owner is disposed", () => {
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {});
			dispose();
		});
		expect(retain).toHaveBeenCalledWith(
			api.events.listEvents,
			{},
			LINGER_TTL
		);
	});

	it("retains the previous args when the args change", () => {
		const [id, setId] = createSignal("a");
		const dispose = createRoot((disposeRoot) => {
			useQuery(api.events.listEventAttendees, () => ({
				eventId: id() as never,
			}));
			return disposeRoot;
		});
		setId("b");
		expect(retain).toHaveBeenCalledWith(
			api.events.listEventAttendees,
			{ eventId: "a" },
			LINGER_TTL
		);
		dispose();
	});

	it("does not retain a query read with linger off", () => {
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {}, { linger: false });
			dispose();
		});
		expect(retain).not.toHaveBeenCalled();
	});

	it("does not retain a disabled query", () => {
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {}, { enabled: false });
			dispose();
		});
		expect(retain).not.toHaveBeenCalled();
	});
});
