// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../../lib/ability.tsx";

const prefetchModule = vi.fn();
vi.mock("../../../modules/prefetchModule.ts", () => ({
	prefetchModule: (entry: { id: string }) => {
		prefetchModule(entry);
	},
}));

import { Sidebar } from "./Sidebar.tsx";

afterEach(cleanup);

function navLabels(role: Role): string[] {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<Sidebar />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	return screen
		.getAllByRole("link")
		.map((link) => link.textContent)
		.filter((label) => label !== "");
}

test("staff see Community and Space, not Events", () => {
	const labels = navLabels("staff").join(" ");
	expect(labels).toContain("Community");
	expect(labels).toContain("Space");
	expect(labels).not.toContain("Events");
});

test("members see Events", () => {
	expect(navLabels("member").join(" ")).toContain("Events");
});

test("hover and focus on a link prefetch that module", () => {
	prefetchModule.mockClear();
	navLabels("board");
	const link = screen.getByText("Events").closest("a")!;
	vi.useFakeTimers();
	fireEvent.pointerEnter(link);
	vi.advanceTimersByTime(149);
	expect(prefetchModule).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1);
	vi.useRealTimers();
	expect(prefetchModule).toHaveBeenLastCalledWith(
		expect.objectContaining({ id: "events" })
	);
	prefetchModule.mockClear();
	fireEvent.focus(link);
	expect(prefetchModule).toHaveBeenCalledWith(
		expect.objectContaining({ id: "events" })
	);
});

test("a touch on a link is not hover intent", () => {
	prefetchModule.mockClear();
	navLabels("board");
	const link = screen.getByText("Events").closest("a")!;
	vi.useFakeTimers();
	fireEvent.pointerEnter(link, { pointerType: "touch" });
	vi.advanceTimersByTime(1000);
	vi.useRealTimers();
	expect(prefetchModule).not.toHaveBeenCalled();
});

test("leaving a module link before the hover delay cancels the prefetch", () => {
	prefetchModule.mockClear();
	navLabels("board");
	const link = screen.getByText("Events").closest("a")!;
	vi.useFakeTimers();
	fireEvent.pointerEnter(link);
	vi.advanceTimersByTime(149);
	fireEvent.pointerLeave(link);
	vi.advanceTimersByTime(1000);
	vi.useRealTimers();
	expect(prefetchModule).not.toHaveBeenCalled();
});
