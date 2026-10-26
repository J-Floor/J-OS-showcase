// @vitest-environment happy-dom
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { SheetNavState } from "../../lib/createSheetNav.ts";

import { EntitySheetNav } from "./EntitySheetNav.tsx";
import { PeekContext } from "./PeekContext.tsx";

afterEach(cleanup);

const seen: { location?: ReturnType<typeof useLocation> } = {};

function currentUrl(): string {
	return seen.location
		? `${seen.location.pathname}${seen.location.search}`
		: "";
}

const nav: SheetNavState = {
	onPrev: vi.fn(),
	onNext: vi.fn(),
	hasPrev: () => true,
	hasNext: () => true,
};

function renderNav(options: { nav?: SheetNavState; peeking?: boolean }) {
	const history = createMemoryHistory();
	history.set({ value: "/events?open=person%3Ap1" });
	function Page() {
		seen.location = useLocation();
		return (
			<Show
				when={options.peeking}
				fallback={<EntitySheetNav nav={options.nav} />}
			>
				<PeekContext.Provider
					value={{
						viewIn: {
							label: "View in People",
							href: "/community?person=p1",
						},
					}}
				>
					<EntitySheetNav nav={options.nav} />
				</PeekContext.Provider>
			</Show>
		);
	}
	render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={Page} />
		</MemoryRouter>
	));
	return currentUrl;
}

test("outside a peek with a nav it renders the prev and next buttons", () => {
	renderNav({ nav });
	expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("outside a peek without a nav it renders nothing", () => {
	renderNav({});
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("inside a peek it renders the view-in button and no arrows", () => {
	renderNav({ nav, peeking: true });
	expect(screen.getAllByRole("button")).toHaveLength(1);
	expect(
		screen.getByRole("button", { name: "View in People" })
	).toBeInTheDocument();
});

test("the view-in button replaces the peek with the entity's page", async () => {
	const url = renderNav({ peeking: true });
	fireEvent.click(screen.getByRole("button", { name: "View in People" }));
	await waitFor(() => {
		expect(url()).toBe("/community?person=p1");
	});
});
