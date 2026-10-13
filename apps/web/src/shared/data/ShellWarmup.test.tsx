// @vitest-environment happy-dom
import { getFunctionName, type FunctionReference } from "convex/server";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";

const convexUseQuery = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("convex-solidjs", () => ({
	useQuery: (...a: unknown[]) => convexUseQuery(...a),
}));
const prefetch = vi.fn<(...a: unknown[]) => void>();
vi.mock("./queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("./queryKeeper.ts")>()),
	prefetch: (...a: unknown[]) => {
		prefetch(...a);
	},
}));
const [allowed, setAllowed] = createSignal(true);
vi.mock("../../lib/ability.tsx", () => ({
	useAbility: () => () => ({
		can: (action: string, subject: string) =>
			allowed() &&
			action === "view" &&
			(subject === "SpaceInfo" || subject === "Events"),
	}),
}));
const preloads = vi.hoisted(() => ({ events: vi.fn(), other: vi.fn() }));
vi.mock("../../modules/registry.ts", () => ({
	modules: [
		{
			id: "events",
			subject: "Events",
			view: {
				preload: (): Promise<void> =>
					preloads.events() as Promise<void>,
			},
		},
		{
			id: "tasks",
			subject: "Tasks",
			view: {
				preload: (): Promise<void> => preloads.other() as Promise<void>,
			},
		},
	],
}));

import { setKeeperActive } from "./queryKeeper.ts";
import { ShellWarmup } from "./ShellWarmup.tsx";

let idleCallbacks: (() => void)[] = [];

function mount(): () => void {
	return createRoot((dispose) => {
		ShellWarmup();
		return dispose;
	});
}

describe("ShellWarmup", () => {
	beforeEach(() => {
		setAllowed(true);
		setKeeperActive(true);
		idleCallbacks = [];
		convexUseQuery.mockReset();
		prefetch.mockReset();
		preloads.events.mockReset().mockResolvedValue(undefined);
		preloads.other.mockReset().mockResolvedValue(undefined);
		vi.stubGlobal("requestIdleCallback", (fn: () => void) => {
			idleCallbacks.push(fn);
			return idleCallbacks.length;
		});
		vi.stubGlobal("cancelIdleCallback", vi.fn());
	});
	afterEach(() => {
		setKeeperActive(false);
		vi.unstubAllGlobals();
	});

	it("holds the current person", () => {
		const dispose = mount();
		expect(
			getFunctionName(
				convexUseQuery.mock.calls[0][0] as FunctionReference<"query">
			)
		).toBe(getFunctionName(api.people.getCurrentPerson));
		expect(convexUseQuery.mock.calls[0][1]).toEqual({});
		dispose();
	});

	it("prefetches wifi.get once idle when the person may see it", () => {
		const dispose = mount();
		expect(prefetch).not.toHaveBeenCalled();
		idleCallbacks.forEach((fn) => {
			fn();
		});
		expect(prefetch).toHaveBeenCalledTimes(1);
		expect(
			getFunctionName(
				prefetch.mock.calls[0][0] as FunctionReference<"query">
			)
		).toBe(getFunctionName(api.wifi.get));
		expect(prefetch.mock.calls[0][1]).toEqual({});
		dispose();
	});

	it("does not prefetch wifi.get without the ability", () => {
		setAllowed(false);
		const dispose = mount();
		idleCallbacks.forEach((fn) => {
			fn();
		});
		expect(prefetch).not.toHaveBeenCalled();
		dispose();
	});

	it("preloads the chunks of modules the person may view once idle", () => {
		const dispose = mount();
		expect(preloads.events).not.toHaveBeenCalled();
		idleCallbacks.forEach((fn) => {
			fn();
		});
		expect(preloads.events).toHaveBeenCalledTimes(1);
		expect(preloads.other).not.toHaveBeenCalled();
		dispose();
	});

	it("warms once the role resolves after idle, and only once", () => {
		setAllowed(false);
		const dispose = mount();
		idleCallbacks.forEach((fn) => {
			fn();
		});
		expect(prefetch).not.toHaveBeenCalled();
		setAllowed(true);
		expect(prefetch).toHaveBeenCalledTimes(1);
		expect(preloads.events).toHaveBeenCalledTimes(1);
		setAllowed(false);
		setAllowed(true);
		expect(prefetch).toHaveBeenCalledTimes(1);
		expect(preloads.events).toHaveBeenCalledTimes(1);
		dispose();
	});

	it("cancels the idle wait on unmount", () => {
		const dispose = mount();
		dispose();
		expect(cancelIdleCallback).toHaveBeenCalledWith(1);
	});

	it("waits for the session before prefetching wifi.get", () => {
		setKeeperActive(false);
		const dispose = mount();
		idleCallbacks.forEach((fn) => {
			fn();
		});
		expect(prefetch).not.toHaveBeenCalled();
		expect(preloads.events).toHaveBeenCalledTimes(1);
		setKeeperActive(true);
		expect(prefetch).toHaveBeenCalledTimes(1);
		dispose();
	});
});
