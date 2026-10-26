// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// The newest version holds only a board item, so a member has nothing new to see.
vi.mock("./changelog.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("./changelog.ts")>();
	const entries: import("./changelog.ts").ChangeEntry[] = [
		{
			version: "9.9",
			title: "Board news",
			items: [
				{
					text: "Board only feature",
					audience: { action: "manage", subject: "Space" },
				},
			],
		},
		{ version: "9.8", title: "Old", items: [{ text: "Old feature" }] },
	];
	return { ...original, CHANGELOG: entries, APP_VERSION: "9.9" };
});

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => ({ person: { onboarding: { tourSeen: true } } }),
		isLoading: () => false,
		error: () => {},
	}),
}));

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { WhatsNew } from "./WhatsNew.tsx";

const SEEN_KEY = "jos:whatsNewSeen";

function renderFor(role: Role) {
	return render(() => (
		<AbilityProvider role={role}>
			<WhatsNew />
		</AbilityProvider>
	));
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem(SEEN_KEY, "9.8");
});

test("with only board items new, a member gets no dialog and the version is recorded", async () => {
	renderFor("member");
	await waitFor(() => {
		expect(localStorage.getItem(SEEN_KEY)).toBe("9.9");
	});
	expect(screen.queryByText("Board only feature")).toBeNull();
	expect(screen.queryByText("Board news")).toBeNull();
});

test("the board sees that same item", async () => {
	renderFor("board");
	await waitFor(() => {
		expect(screen.getByText("Board only feature")).toBeInTheDocument();
	});
});
