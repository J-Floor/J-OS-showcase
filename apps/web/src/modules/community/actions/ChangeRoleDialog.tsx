import { Button, Dialog } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";

import styles from "./ChangeRoleDialog.module.scss";
import { RoleChooser } from "./RoleChooser.tsx";
import type { RoleMove } from "./roleMoves.ts";

export { MOVES } from "./roleMoves.ts";
export type { RoleMove } from "./roleMoves.ts";

/**
 * The batch/row way to change a role: the same chooser the drawer shows inline
 * (see {@link RoleChooser}), wrapped in a dialog with its own confirm.
 */
export function ChangeRoleDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Machine state of every selected row. */
	states: StateId[];
	count: number;
	onMove: (move: RoleMove) => void | Promise<void>;
}): JSX.Element {
	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(d) => {
				props.onOpenChange(d.open);
			}}
		>
			<Dialog.Content>
				<Dialog.Title>
					{props.count > 1
						? `Change role for ${String(props.count)} people`
						: "Change role"}
				</Dialog.Title>
				{/* Keep Dialog.Root + content mounted (even closed) so the
				    open/close transition animates; gate the chooser on `open` so
				    the closed dialog leaves no inputs in the DOM — and so a
				    choice made and cancelled dies with it rather than surviving
				    into the next opening, where it may no longer be legal. */}
				<Show when={props.open}>
					<RoleChooser
						states={props.states}
						onMove={props.onMove}
						onDone={() => {
							props.onOpenChange(false);
						}}
					>
						{(chooser) => (
							<div class={styles.footer}>
								<Dialog.CloseTrigger
									asChild={(closeProps) => (
										<Button
											{...(closeProps() as object)}
											variant="tertiary"
										>
											Cancel
										</Button>
									)}
								/>
								<Button
									isLoading={chooser.saving()}
									disabled={chooser.move() === undefined}
									shamefullyOmitDisabledReason
									onClick={chooser.commit}
								>
									Change role
								</Button>
							</div>
						)}
					</RoleChooser>
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
