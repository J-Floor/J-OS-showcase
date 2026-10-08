// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider } from "../../lib/ability.tsx";
import { RULES_SEARCH_LABEL } from "../../shared/rules/rulesContent.ts";

import { SpacePage } from "./SpacePage.tsx";

// Stub out convex-solidjs so cards using useAction, useQuery, or useMutation
// render without a ConvexProvider. CountdownCard (on the Access tab) and
// WifiCard use useQuery; DiagnosticsTab's LockHealthCard resolves an action
// via mutateAsync; WifiCard also fires a useMutation on open.
// `people.getCurrentPerson` (UnlockCard, CountdownCard) returns `me.value`;
// every other query stays loading. `undefined` = still loading.
const { me, doorHealthCalls } = vi.hoisted(() => {
	const me: { value: Record<string, unknown> | undefined } = {
		value: undefined,
	};
	return { me, doorHealthCalls: { count: 0 } };
});

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useAction: (ref: Parameters<typeof getFunctionName>[0]) => ({
			mutate: vi.fn(),
			mutateAsync: () => {
				if (getFunctionName(ref) === "doorHealth:doorHealth")
					doorHealthCalls.count++;
				return Promise.resolve(undefined);
			},
			isLoading: () => false,
			data: () => undefined,
			error: () => undefined,
		}),
		useQuery: (ref: Parameters<typeof getFunctionName>[0]) => ({
			data: () =>
				getFunctionName(ref) === "people:getCurrentPerson"
					? me.value
					: undefined,
			error: () => undefined,
			isLoading: () => false,
		}),
		useMutation: () => ({
			mutateAsync: () => Promise.resolve(null),
		}),
		// DiagnosticsTab's door log reads its floor one-shot; never resolving
		// keeps the log loading, which these tests do not look at.
		useConvexClient: () => ({ query: () => new Promise(() => undefined) }),
	};
});

afterEach(() => {
	cleanup();
	me.value = undefined;
	doorHealthCalls.count = 0;
});

// jsdom gaps ark Tabs touches at mount.
if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

function renderSpace(role: "member" | "board" | "staff") {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<SpacePage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

// MemoryRouter is required because SpacePage now uses useSearchParams to keep
// the active tab in the URL. AbilityProvider is required because WifiCard
// (on the Access tab) calls useAbility(), which throws without one.
test("renders the Access and Rules tabs (no empty Live tab)", () => {
	renderSpace("member");
	expect(screen.getByRole("tab", { name: "Access" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Rules" })).toBeInTheDocument();
	expect(screen.queryByRole("tab", { name: "Live" })).not.toBeInTheDocument();
	expect(
		screen.queryByRole("tab", { name: "Diagnostics" })
	).not.toBeInTheDocument();
});

test("a member with door access sees the Doors card on the Access tab", () => {
	me.value = { tier: "member", stage: "active", stageSince: 0 };
	renderSpace("member");
	expect(screen.getByText("Doors")).toBeInTheDocument();
});

test("a member the board shut out sees no Doors card", () => {
	me.value = {
		tier: "member",
		stage: "active",
		stageSince: 0,
		door: { override: "force_off" },
	};
	renderSpace("member");
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
});

test("staff sees the unlock card only, without a Rules tab", () => {
	me.value = { tier: "staff", stage: "active", stageSince: 0 };
	renderSpace("staff");
	expect(screen.queryByRole("tab", { name: "Rules" })).toBeNull();
	expect(screen.queryByText(/wi-?fi/i)).toBeNull();
	expect(screen.getByText("Doors")).toBeInTheDocument();
});

test("board members also get a Diagnostics tab", () => {
	renderSpace("board");
	expect(screen.getByRole("tab", { name: "Access" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Rules" })).toBeInTheDocument();
	expect(
		screen.getByRole("tab", { name: "Diagnostics" })
	).toBeInTheDocument();
});

// Ark keeps every tab panel mounted by default, so the door-health card used
// to fetch once at page load and show that reading whenever the tab was opened.
test("door health is fetched when the Diagnostics tab opens, not at page load", async () => {
	renderSpace("board");
	expect(doorHealthCalls.count).toBe(0);
	fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
	await waitFor(() => {
		expect(doorHealthCalls.count).toBe(1);
	});
	fireEvent.click(screen.getByRole("tab", { name: "Access" }));
	await waitFor(() =>
		expect(screen.getByRole("tab", { name: "Access" })).toHaveAttribute(
			"aria-selected",
			"true"
		)
	);
	fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
	await waitFor(() => {
		expect(doorHealthCalls.count).toBe(2);
	});
});

test("the rules search sits in the tab bar on the Rules tab only", async () => {
	renderSpace("member");
	expect(
		screen.queryByRole("searchbox", { name: RULES_SEARCH_LABEL })
	).toBeNull();
	fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
	const search = await screen.findByRole("searchbox", {
		name: RULES_SEARCH_LABEL,
	});
	fireEvent.input(search, { target: { value: "dishwasher" } });
	await waitFor(() => {
		expect(screen.getAllByRole("listitem")).toHaveLength(1);
	});
});
