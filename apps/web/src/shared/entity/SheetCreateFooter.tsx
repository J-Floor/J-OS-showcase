import { Show, type JSX } from "solid-js";

import { ActionBar } from "../actions/ActionBar.tsx";
import {
	CREATE_TARGET,
	type ActionDescriptor,
	type CreateTarget,
} from "../actions/shortcuts.ts";

import { SheetFooter } from "./SheetFooter.tsx";

/** A sheet's footer on its create form: the Create action (its button, the
 *  key's chip while peeking, its spinner while it runs), once the sheet has
 *  loaded. Nothing on an existing row. */
export function SheetCreateFooter(props: {
	create: ActionDescriptor<CreateTarget>;
	isCreating: boolean;
}): JSX.Element {
	return (
		<Show when={props.isCreating}>
			<SheetFooter>
				<ActionBar actions={[props.create]} target={CREATE_TARGET} />
			</SheetFooter>
		</Show>
	);
}
