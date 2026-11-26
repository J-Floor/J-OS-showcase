import { Sheet } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import { RowViewCount } from "../views/RowViewCount.tsx";

import type { SheetNavState } from "./createSheetNav.ts";
import { EntitySheetNav } from "./EntitySheetNav.tsx";

/** The title, the save status, prev/next (or, in a peek, the link to the
 *  entity's page), the caller's own actions (an edit toggle, a delete)
 *  and close. */
export function EntitySheetHeader(props: {
	title: string;
	loading?: boolean;
	nav?: SheetNavState;
	/** Shows what the fields have saved: an existing row's sheet, never a
	 *  create form's. */
	saveStatus?: boolean;
	/** What views of this entity are counted under (`rowViewKey`): an
	 *  existing, loaded row's sheet, never a create form's. Shown to the
	 *  board as an eye with today's count. */
	viewKey?: string;
	children?: JSX.Element;
}): JSX.Element {
	return (
		<Sheet.Header>
			<Sheet.Title loading={props.loading}>{props.title}</Sheet.Title>
			<Sheet.HeaderActions>
				<RowViewCount viewKey={props.viewKey} />
				<Show when={props.saveStatus}>
					<Sheet.SaveStatus />
				</Show>
				<EntitySheetNav nav={props.nav} />
				{props.children}
				<Sheet.Close />
			</Sheet.HeaderActions>
		</Sheet.Header>
	);
}
