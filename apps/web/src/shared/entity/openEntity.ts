import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";

import type { EntityRow } from "../types.ts";

import { entityPathOf, type EntityDescriptor } from "./entityDescriptor.ts";
import { PEEK_PARAM, peekValue } from "./peekParam.ts";
import { pushedOpenState } from "./pushedOpen.ts";

/** Opens one entity: its page's own sheet when that page is the one on
 *  screen, else a peek over the current page. */
export function useOpenEntity() {
	const location = useLocation();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	return <Row extends EntityRow>(
		desc: EntityDescriptor<Row>,
		slug: string
	): void => {
		if (location.pathname === desc.route) {
			// A peek open on this page was the entry before: replacing it keeps
			// Back from reopening the peek once the sheet is closed.
			navigate(entityPathOf(desc, slug), {
				replace: params[PEEK_PARAM] !== undefined,
			});
			return;
		}
		setParams(
			{ [PEEK_PARAM]: peekValue(desc, slug) },
			{
				state: pushedOpenState(PEEK_PARAM),
				// A peek already open is stepped to another entity, never stacked:
				// closing it must land back on the page.
				replace: params[PEEK_PARAM] !== undefined,
			}
		);
	};
}
