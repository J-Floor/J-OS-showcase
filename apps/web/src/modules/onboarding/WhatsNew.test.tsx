// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// `WhatsNew` reads `onboarding.getState` to tell a member or guest (who has an
// `onboarding` record) from board/admin (who have none). Stub the subscription
// so it renders without a ConvexProvider; the person's `onboarding` record is
// swapped per test — `undefined` models board/admin.
const { state } = vi.hoisted(
	(): {
		state: {
			onboarding: { steps: Record<string, never> } | undefined;
			/** Extra person fields (tier, stage, door, doorsIntroSeenAt …). */
			extra: Record<string, unknown>;
			/** Re-runs the component's effects after `extra` changes. */
			bump: () => void;
		};
	} => ({
		state: {
			onboarding: { steps: {} },
			extra: {},
			bump: () => {},
		},
	})
);

vi.mock("convex-solidjs", async () => {
	const { createSignal } = await import("solid-js");
	const [version, setVersion] = createSignal(0);
	state.bump = () => setVersion((count) => count + 1);
	return {
		useQuery: () => ({
			data: () => {
				version();
				return {
					person: { onboarding: state.onboarding, ...state.extra },
				};
			},
			isLoading: () => false,
			error: () => {},
		}),
	};
});

import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { OPEN_DIALOG_CONTENT } from "../../shared/dialogSelectors.ts";

import { APP_VERSION, CHANGELOG, isNewer } from "./changelog.ts";
import { WhatsNew } from "./WhatsNew.tsx";

// The newest item for everyone, staff included: the tests below render staff
// too, and an item gated on a community subject would be hidden from them.
const everyoneItem = CHANGELOG.flatMap((entry) => entry.items).find(
	(item) => item.audience === undefined
);
if (!everyoneItem) throw new Error("the changelog needs an item for everyone");
const ALT_LINE = everyoneItem.text;
const BOARD_LINE = "Edit the Wi-Fi details";
const SEEN_KEY = "jos:whatsNewSeen";
/** Older than every changelog entry: this browser has seen a version before. */
const SEEN_BEFORE = "0.0";

function renderFor(role: Role) {
	return render(() => (
		<AbilityProvider role={role}>
			<WhatsNew />
		</AbilityProvider>
	));
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem(SEEN_KEY, SEEN_BEFORE);
	state.onboarding = { steps: {} };
	state.extra = {};
});

test("isNewer: null seen is always new; compares field by field", () => {
	expect(isNewer("1.1", null)).toBe(true);
	expect(isNewer("1.1", "1.1")).toBe(false);
	expect(isNewer("1.10", "1.9")).toBe(true);
	expect(isNewer("1.0", "1.1")).toBe(false);
});

test("shows the changelog to a member who has not seen this version", async () => {
	renderFor("member");
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("shows to board/admin, who have no onboarding record — they are its audience", async () => {
	// Even on a first visit from this browser: the first-visit rule must not
	// hide What's New from the very people it is written for.
	localStorage.removeItem(SEEN_KEY);
	state.onboarding = undefined;
	renderFor("board");
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("does NOT show on a member's first visit from this browser — records the version", async () => {
	localStorage.removeItem(SEEN_KEY);
	renderFor("member");
	await waitFor(() => {
		expect(localStorage.getItem(SEEN_KEY)).toBe(APP_VERSION);
	});
	expect(screen.queryByText(ALT_LINE)).toBeNull();
});

test("does NOT show when this version has already been acknowledged", async () => {
	localStorage.setItem(SEEN_KEY, APP_VERSION);
	renderFor("member");
	// Nothing to show; the item never appears.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();
});

const OPEN_DOOR_MEMBER = { tier: "member", stage: "active", stageSince: 0 };

test("waits while the doors intro is pending: shows nothing and records nothing", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER };
	renderFor("member");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();
	expect(localStorage.getItem(SEEN_KEY)).toBe(SEEN_BEFORE);
});

test("shows once the doors intro is dismissed", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER };
	renderFor("member");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByText(ALT_LINE)).toBeNull();

	state.extra = { ...OPEN_DOOR_MEMBER, doorsIntroSeenAt: 1 };
	state.bump();
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("is not held back for someone the door is closed to — they get no intro", async () => {
	state.extra = { ...OPEN_DOOR_MEMBER, door: { override: "force_off" } };
	renderFor("member");
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
});

test("closing keeps the notes mounted, so the exit has something to animate", async () => {
	renderFor("member");
	await waitFor(() => {
		expect(document.querySelector(OPEN_DIALOG_CONTENT)).not.toBeNull();
	});

	fireEvent.click(screen.getByText("Got it"));
	await waitFor(() => {
		expect(document.querySelector(OPEN_DIALOG_CONTENT)).toBeNull();
	});
	expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
});

test("a member sees the everyone items but not the board ones", async () => {
	renderFor("member");
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
	expect(screen.queryByText(BOARD_LINE, { exact: false })).toBeNull();
});

test("staff see the doors item but not the community-only ones", async () => {
	state.onboarding = undefined;
	renderFor("staff");
	await waitFor(() => {
		expect(screen.getByText(ALT_LINE)).toBeInTheDocument();
	});
	expect(screen.queryByText(/notifications on your phone/i)).toBeNull();
	expect(screen.queryByText(/house rules/i)).toBeNull();
	expect(screen.queryByText(/start and an end time/i)).toBeNull();
	expect(screen.queryByText(/Wi-Fi network/i)).toBeNull();
	expect(screen.queryByText(/Events: create/i)).toBeNull();
});

test("the board sees the board items too", async () => {
	state.onboarding = undefined;
	renderFor("board");
	await waitFor(() => {
		expect(
			screen.getByText(BOARD_LINE, { exact: false })
		).toBeInTheDocument();
	});
});
