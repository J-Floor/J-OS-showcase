// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// `WhatsNew` reads `onboarding.getState` to tell whether the welcome tour will
// run (a member/guest still onboarding) from everyone else. Stub the
// subscription so it renders without a ConvexProvider; the person's `onboarding`
// record is swapped per test — `undefined` models board/admin, who have none.
const { state } = vi.hoisted(
	(): {
		state: {
			onboarding: { tourSeen: boolean } | undefined;
			/** Extra person fields (tier, stage, door, doorsIntroSeenAt …). */
			extra: Record<string, unknown>;
			/** Re-runs the component's effects after `extra` changes. */
			bump: () => void;
		};
	} => ({
		state: {
			onboarding: { tourSeen: true },
			extra: {},
			bump: () => undefined,
		},
	})
);

vi.mock("convex-solidjs", async () => {
	const { createSignal } = await import("solid-js");
	const [version, setVersion] = createSignal(0);
	state.bump = () => setVersion((n) => n + 1);
	return {
		useQuery: () => ({
			data: () => {
				version();
				return {
					person: { onboarding: state.onboarding, ...state.extra },
				};
			},
			isLoading: () => false,
			error: () => undefined,
		}),
	};
});

import { APP_VERSION, CHANGELOG, isNewer } from "./changelog.ts";
import { WhatsNew } from "./WhatsNew.tsx";

const ALT_LINE = CHANGELOG[0].items[0];

beforeEach(() => {
	localStorage.clear();
	state.onboarding = { tourSeen: true };
	state.extra = {};
});

test("isNewer: null seen is always new; compares field by field", () => {
	expect(isNewer("1.1", null)).toBe(true);
	expect(isNewer("1.1", "1.1")).toBe(false);
	expect(isNewer("1.10", "1.9")).toBe(true);
	expect(isNewer("1.0", "1.1")).toBe(false);
});

test("shows the changelog to a member who finished the tour and has not seen this version", async () => {
	state.onboarding = { tourSeen: true };
	// seen is null (cleared) → everything is new.
	render(() => <WhatsNew />);
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("shows to board/admin, who have no onboarding record — they are its audience", async () => {
	// The bug this guards: `onboarding?.tourSeen ?? false` misread board/admin
	// (no onboarding) as brand-new and hid What's New from the very people it is
	// written for.
	state.onboarding = undefined;
	render(() => <WhatsNew />);
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("does NOT show while the welcome tour will run (member still onboarding) — records the version", async () => {
	state.onboarding = { tourSeen: false }; // tour will run for them
	render(() => <WhatsNew />);
	await waitFor(() => {
		expect(localStorage.getItem("jos:whatsNewSeen")).toBe(APP_VERSION);
	});
	expect(screen.queryByText(ALT_LINE)).toBeNull();
});

test("does NOT show when this version has already been acknowledged", async () => {
	state.onboarding = { tourSeen: true };
	localStorage.setItem("jos:whatsNewSeen", APP_VERSION);
	render(() => <WhatsNew />);
	// Nothing to show; the item never appears.
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();
});

const OPEN_DOOR_MEMBER = { tier: "member", stage: "active", stageSince: 0 };

test("waits while the doors intro is pending: shows nothing and records nothing", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER };
	render(() => <WhatsNew />);
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();
	expect(localStorage.getItem("jos:whatsNewSeen")).toBeNull();
});

test("shows once the doors intro is dismissed", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER };
	render(() => <WhatsNew />);
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();

	state.extra = { ...OPEN_DOOR_MEMBER, doorsIntroSeenAt: 1 };
	state.bump();
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("is not held back for someone the door is closed to — they get no intro", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER, door: { override: "force_off" } };
	render(() => <WhatsNew />);
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});
