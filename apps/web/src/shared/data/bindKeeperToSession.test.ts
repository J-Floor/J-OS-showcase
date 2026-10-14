import type { ConvexClient } from "convex/browser";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";

import { bindKeeperToSession } from "./bindKeeperToSession.ts";
import { lastAnswer, rememberAnswer } from "./lastAnswer.ts";
import {
	LINGER_TTL,
	bindQueryKeeper,
	keptCount,
	retain,
	setKeeperActive,
} from "./queryKeeper.ts";

type State = { data: { user: { id: string } } | null };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	setKeeperActive(false);
	bindQueryKeeper(undefined);
	vi.useRealTimers();
});

function setup(initial: State) {
	bindQueryKeeper({
		disabled: false,
		onUpdate: vi.fn(() => vi.fn()),
	} as unknown as ConvexClient);
	const [state, setState] = createSignal<State>(initial, { equals: false });
	const dispose = createRoot((disposeRoot) => {
		bindKeeperToSession(state);
		return disposeRoot;
	});
	return { setState, dispose };
}

it("follows sign-in and sign-out", () => {
	const { setState, dispose } = setup({ data: null });
	retain(api.events.listEvents, {}, LINGER_TTL);
	expect(keptCount()).toBe(0);
	setState({ data: { user: { id: "u1" } } });
	retain(api.events.listEvents, {}, LINGER_TTL);
	expect(keptCount()).toBe(1);
	setState({ data: null });
	expect(keptCount()).toBe(0);
	dispose();
});

it("a refetch re-emitting the same user does not re-activate after sign-out began", () => {
	const { setState, dispose } = setup({ data: { user: { id: "u1" } } });
	setKeeperActive(false);
	setState({ data: { user: { id: "u1" } } });
	retain(api.events.listEvents, {}, LINGER_TTL);
	expect(keptCount()).toBe(0);
	dispose();
});

it("a new user with no signed-out moment between starts from empty caches", () => {
	const { setState, dispose } = setup({ data: { user: { id: "a" } } });
	retain(api.events.listEvents, {}, LINGER_TTL);
	rememberAnswer("occupancy", { enabled: true });
	expect(keptCount()).toBe(1);
	setState({ data: { user: { id: "b" } } });
	expect(keptCount()).toBe(0);
	expect(lastAnswer("occupancy", LINGER_TTL)).toBeUndefined();
	dispose();
});

it("signing out forgets remembered answers", () => {
	const { setState, dispose } = setup({ data: { user: { id: "a" } } });
	rememberAnswer("occupancy", { enabled: true });
	setState({ data: null });
	expect(lastAnswer("occupancy", LINGER_TTL)).toBeUndefined();
	dispose();
});
