import { Sheet } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import type { SheetNavState } from "../../lib/createSheetNav.ts";

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
	children?: JSX.Element;
}): JSX.Element {
	return (
		<Sheet.Header>
			<Sheet.Title loading={props.loading}>{props.title}</Sheet.Title>
			<Sheet.HeaderActions>
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
