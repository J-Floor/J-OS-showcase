// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";

const convexUseQuery = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("convex-solidjs", () => ({
	useQuery: (...a: unknown[]) => convexUseQuery(...a),
}));
const retain = vi.fn<(...a: unknown[]) => void>();
vi.mock("./queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("./queryKeeper.ts")>()),
	retain: (...a: unknown[]) => {
		retain(...a);
	},
}));

import { LINGER_TTL } from "./queryKeeper.ts";
import { useQuery } from "./useQuery.ts";

function resolveOpts(): Record<string, unknown> {
	const opts = convexUseQuery.mock.calls[0][2] as () => Record<
		string,
		unknown
	>;
	return opts();
}

describe("useQuery", () => {
	beforeEach(() => {
		convexUseQuery.mockReset().mockReturnValue({ data: () => undefined });
		retain.mockReset();
	});

	it("defaults keepPreviousData and lets callers override it", () => {
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {});
			dispose();
		});
		expect(resolveOpts().keepPreviousData).toBe(true);
		convexUseQuery.mockClear();
		createRoot((dispose) => {
			useQuery(api.events.listEvents, {}, { keepPreviousData: false });
			dispose();
		});
		expect(resolveOpts().keepPreviousData).toBe(false);
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
		const dispose = createRoot((d) => {
			useQuery(api.events.listEventAttendees, () => ({
				eventId: id() as never,
			}));
			return d;
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
