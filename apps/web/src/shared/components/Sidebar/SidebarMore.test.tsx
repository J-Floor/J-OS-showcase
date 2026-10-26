// @vitest-environment happy-dom
import { PHONE_QUERY } from "@j-os/design-system";
import {
	createMemoryHistory,
	MemoryRouter,
	Route,
	useLocation,
	useNavigate,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@solidjs/testing-library";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../../lib/ability.tsx";
import { modules } from "../../../modules/registry.ts";
import type { ModuleManifest } from "../../../modules/types.ts";

vi.mock("../../../modules/prefetchModule.ts", () => ({
	prefetchModule: () => {},
}));

// Tests set the list to bring their own pages; unset, the real registry.
const registry = vi.hoisted(() => ({
	override: undefined as ModuleManifest[] | undefined,
}));
vi.mock("../../../modules/registry.ts", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../modules/registry.ts")>();
	return {
		...actual,
		get modules() {
			return registry.override ?? actual.modules;
		},
	};
});

import { Sidebar } from "./Sidebar.tsx";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	registry.override = undefined;
});

function moreButton(): HTMLElement {
	// Hidden too: a modal dialog takes the page behind it out of the tree.
	return screen.getByRole("button", { name: "More", hidden: true });
}

function sheet(): HTMLElement {
	return screen.getByRole("dialog", { name: "More pages" });
}

function Where() {
	const location = useLocation();
	const navigate = useNavigate();
	return (
		<>
			<output data-testid="where">{location.pathname}</output>
			<button
				type="button"
				data-testid="go-extra"
				aria-hidden="true"
				onClick={() => {
					navigate("/extra");
				}}
			/>
		</>
	);
}

function stubViewport(isPhone: boolean): void {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: isPhone && query === PHONE_QUERY,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
}

/** What a tap does: the control takes focus, then the click lands. */
function tap(element: HTMLElement): void {
	element.focus();
	fireEvent.click(element);
}

async function opens(): Promise<void> {
	tap(moreButton());
	await screen.findByRole("dialog", { name: "More pages" });
}

// happy-dom applies no media queries, so these assert the markup the phone
// layout styles; the layout itself is Sidebar.module.scss.
describe("the phone bar's more item", () => {
	const sixPages: ModuleManifest[] = [
		...modules,
		{ ...modules[0], id: "extra", label: "Extra", path: "/extra" },
	];

	function renderBar(
		role: Role,
		pages?: ModuleManifest[],
		route = "/",
		isPhone = true
	): void {
		stubViewport(isPhone);
		registry.override = pages;
		const history = createMemoryHistory();
		history.set({ value: route });
		render(() => (
			<MemoryRouter history={history}>
				<Route
					path="*"
					component={() => (
						<AbilityProvider role={role}>
							<Sidebar />
							<Where />
						</AbilityProvider>
					)}
				/>
			</MemoryRouter>
		));
	}

	test("today's registry fits the five slots, with no more item", () => {
		renderBar("board");
		expect(screen.getAllByRole("link")).toHaveLength(6);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
	});

	test("six pages show four items and a collapsed more button", () => {
		renderBar("board", sixPages);
		const bar = within(screen.getByTestId("phone-bar-row"));
		expect(bar.getAllByRole("link")).toHaveLength(4);
		expect(moreButton().getAttribute("aria-expanded")).toBe("false");
		expect(moreButton().getAttribute("aria-haspopup")).toBe("dialog");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("opening shows a dialog with the overflow pages and the bar's row", async () => {
		renderBar("board", sixPages);
		await opens();
		expect(moreButton().getAttribute("aria-expanded")).toBe("true");
		const links = within(sheet()).getAllByRole("link");
		// The overflow first, then the bar's four pages again.
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"/tasks",
			"/extra",
			...modules.slice(0, 4).map((module) => module.path),
		]);
		// Icon and label in each.
		expect(links[0]?.textContent).toMatch(/^\S+Tasks$/);
		expect(
			within(sheet()).getByRole("button", { name: "Close" })
		).toBeTruthy();
	});

	test("the bar's pages are drawn again without repeating their ids", async () => {
		renderBar("board", sixPages);
		await opens();
		const ids = [...document.querySelectorAll("[id^='nav-']")].map(
			(element) => element.id
		);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("focus moves into the dialog on open", async () => {
		renderBar("board", sixPages);
		await opens();
		await vi.waitFor(() => {
			expect(sheet().contains(document.activeElement)).toBe(true);
		});
	});

	test("the page behind is hidden from the tree, so focus stays in the dialog", async () => {
		renderBar("board", sixPages);
		await opens();
		await vi.waitFor(() => {
			expect(screen.queryByRole("button", { name: "More" })).toBeNull();
		});
	});

	async function closes(close: () => void): Promise<void> {
		renderBar("board", sixPages);
		await opens();
		// Ark starts listening for Escape and a press outside some time after
		// the open, later on a loaded machine: try until it closes.
		await vi.waitFor(() => {
			if (screen.queryByRole("dialog")) close();
			expect(moreButton().getAttribute("aria-expanded")).toBe("false");
		});
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(moreButton());
		});
	}

	test("Escape closes it and returns focus to more", async () => {
		await closes(() => {
			fireEvent.keyDown(sheet(), { key: "Escape" });
		});
	});

	test("a press outside closes it", async () => {
		await closes(() => {
			const backdrop = document.querySelector(
				'[data-scope="dialog"][data-part="backdrop"]'
			);
			if (!backdrop) throw new Error("no backdrop");
			fireEvent.pointerDown(backdrop);
			fireEvent.pointerUp(backdrop);
			fireEvent.click(backdrop);
		});
	});

	test("Close closes it", async () => {
		await closes(() => {
			fireEvent.click(
				within(sheet()).getByRole("button", { name: "Close" })
			);
		});
	});

	test("picking a page closes it and navigates", async () => {
		await closes(() => {
			fireEvent.click(within(sheet()).getByText("Extra"));
		});
		expect(screen.getByTestId("where").textContent).toBe("/extra");
	});

	test("picking a page of the bar's row closes it and navigates", async () => {
		await closes(() => {
			fireEvent.click(
				within(sheet()).getByRole("link", {
					name: new RegExp(`${modules[1]?.label ?? ""}$`),
				})
			);
		});
		expect(screen.getByTestId("where").textContent).toBe(modules[1]?.path);
	});

	test("a page change by any other route closes it", async () => {
		renderBar("board", sixPages);
		await opens();
		fireEvent.click(screen.getByTestId("go-extra"));
		await vi.waitFor(() => {
			expect(moreButton().getAttribute("aria-expanded")).toBe("false");
		});
	});

	test("two quick taps on more toggle it once each, leaving it closed", async () => {
		renderBar("board", sixPages);
		tap(moreButton());
		tap(moreButton());
		await vi.waitFor(() => {
			expect(moreButton().getAttribute("aria-expanded")).toBe("false");
		});
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("more carries the active state when the page is in the overflow", () => {
		renderBar("board", sixPages, "/extra");
		expect(moreButton().getAttribute("aria-current")).toBe("true");
	});

	test("more is not active when the page is on the bar", () => {
		renderBar("board", sixPages, "/events");
		expect(moreButton().hasAttribute("aria-current")).toBe(false);
	});
});
