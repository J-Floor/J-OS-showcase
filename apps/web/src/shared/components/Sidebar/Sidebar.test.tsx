// @vitest-environment happy-dom
import { viewTransition } from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, test, vi } from "vitest";

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

/** A transition that runs until `finish()`. */
function holdTransition(): { finish: () => void } {
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	Object.assign(document, {
		startViewTransition: (update: () => unknown) => {
			void Promise.resolve().then(update);
			return { finished, updateCallbackDone: finished };
		},
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	void viewTransition(() => {});
	return { finish };
}

function rail(): HTMLElement {
	return screen.getByRole("navigation");
}

describe("the rail's hover during a transition", () => {
	afterEach(async () => {
		// Let the held transition's cleanup run before the next test.
		await new Promise((resolve) => setTimeout(resolve, 0));
		Reflect.deleteProperty(document, "startViewTransition");
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("a mouseleave mid-transition does not collapse it; the end re-reads hover", async () => {
		navLabels("board");
		const nav = rail();
		fireEvent.mouseEnter(nav);
		const expanded = nav.className;
		const transition = holdTransition();
		fireEvent.mouseLeave(nav);
		expect(nav.className).toBe(expanded);
		vi.spyOn(nav, "matches").mockReturnValue(false);
		transition.finish();
		await vi.waitFor(() => {
			expect(nav.className).not.toBe(expanded);
		});
	});

	test("a pointer still over the rail at the end keeps it expanded", async () => {
		navLabels("board");
		const nav = rail();
		fireEvent.mouseEnter(nav);
		const expanded = nav.className;
		const transition = holdTransition();
		fireEvent.mouseLeave(nav);
		vi.spyOn(nav, "matches").mockReturnValue(true);
		transition.finish();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(nav.className).toBe(expanded);
	});

	test("without a transition a mouseleave collapses it", () => {
		navLabels("board");
		const collapsed = rail().className;
		fireEvent.mouseEnter(rail());
		expect(rail().className).not.toBe(collapsed);
		fireEvent.mouseLeave(rail());
		expect(rail().className).toBe(collapsed);
	});
});
