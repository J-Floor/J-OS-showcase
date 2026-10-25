import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
} from "@solidjs/router";
import { render } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

import { AbilityProvider } from "../../../lib/ability.tsx";
import { OPEN_DIALOG_CONTENT } from "../../../shared/dialogSelectors.ts";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import type { Identified } from "../../../shared/types.ts";

import type { PersonSelection } from "./TabProps.ts";

/**
 * Renders a roster tab the way the page does: inside a router, handed the
 * page-wide person selection. The tabs take that selection as a prop and own
 * no URL code of their own, so a unit test needs a real one to drive them.
 *
 * `rows: () => undefined` keeps the hook's dead-link and vanished-row checks
 * out of tab unit tests — the tab does its own lookup in its own rows.
 *
 * `url()` is the router's reactive `search`, not `history.get()`, which lags a
 * `setSearchParams` write (it goes through a transition).
 */
export function renderWithSelection(
	ui: (selection: PersonSelection) => JSX.Element,
	options?: { path?: string }
) {
	const history = createMemoryHistory();
	history.set({
		value: options?.path ?? "/community",
		scroll: false,
		replace: true,
	});
	let location: ReturnType<typeof useLocation> | undefined;
	function Page() {
		const selection = createEntitySelection<Identified<"people">>({
			rows: () => {},
			param: "person",
		});
		location = useLocation();
		return ui(selection);
	}
	const result = render(() => (
		<AbilityProvider role="board">
			<MemoryRouter history={history}>
				<Route path="*" component={Page} />
			</MemoryRouter>
		</AbilityProvider>
	));
	return { ...result, url: () => location?.search ?? "" };
}

/** The sheet panel Ark is actually showing. Closed content stays in the DOM,
 *  so "is the text there" is not the same question as "is the sheet open". */
export function openPanel(): HTMLElement | null {
	return document.querySelector<HTMLElement>(OPEN_DIALOG_CONTENT);
}
