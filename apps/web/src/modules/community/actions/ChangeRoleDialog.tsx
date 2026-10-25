import { Dialog } from "@j-os/design-system";
import { type JSX } from "solid-js";

import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";
import type { OpenProps } from "../../../shared/types.ts";

import { RoleChooser } from "./RoleChooser.tsx";
import type { RoleMove } from "./roleMoves.ts";
import type { MoveResult } from "./triage.ts";

export { MOVES } from "./roleMoves.ts";
export type { RoleMove } from "./roleMoves.ts";

/**
 * The batch/row way to change a role: the same chooser the sheet shows inline
 * (see {@link RoleChooser}), wrapped in a dialog with its own confirm.
 */
export function ChangeRoleDialog(
	props: OpenProps & {
		/** Machine state of every selected row. */
		states: StateId[];
		count: number;
		onMove: (move: RoleMove) => Promise<MoveResult>;
	}
): JSX.Element {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			{/* Built for each opening (as every dialog's content is), so a
			    choice made and cancelled dies with it rather than surviving
			    into the next opening, where it may no longer be legal. */}
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>
						{props.count > 1
							? `Change role for ${String(props.count)} people`
							: "Change role"}
					</Dialog.Title>
				</Dialog.Header>
				<RoleChooser.Root
					states={props.states}
					onMove={props.onMove}
					onDone={() => {
						props.onOpenChange(false);
					}}
				>
					<Dialog.Footer>
						<Dialog.Cancel />
						<RoleChooser.Commit />
					</Dialog.Footer>
				</RoleChooser.Root>
			</Dialog.Content>
		</Dialog.Root>
	);
}
