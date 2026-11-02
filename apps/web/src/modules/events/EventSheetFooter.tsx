import { Show } from "solid-js";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Can } from "../../lib/ability.tsx";
import { ActionBar } from "../../shared/actions/ActionBar.tsx";
import { CREATE_TARGET } from "../../shared/actions/shortcuts.ts";
import { SheetFooter } from "../../shared/entity/SheetFooter.tsx";

import type { EventSheetActions } from "./eventActions.ts";

/**
 * The sheet's footer: Delete on an existing event (board/admin only, no
 * footer for anyone else), Create on the create form. Nothing while the row
 * is still loading. Both come from the same descriptors as the keys.
 */
export function EventSheetFooter(props: {
	event: Doc<"events"> | undefined;
	loading?: boolean;
	canManage: boolean;
	actions: EventSheetActions;
}) {
	return (
		<Show when={!props.loading}>
			<Show
				when={props.event}
				fallback={
					<Can I="create" the="Events">
						<SheetFooter>
							<ActionBar
								actions={[props.actions.create]}
								target={CREATE_TARGET}
							/>
						</SheetFooter>
					</Can>
				}
			>
				{(event) => (
					<Show when={props.canManage}>
						<SheetFooter error={props.actions.deleteError()}>
							<ActionBar
								actions={[props.actions.remove]}
								target={event()}
							/>
						</SheetFooter>
					</Show>
				)}
			</Show>
		</Show>
	);
}
