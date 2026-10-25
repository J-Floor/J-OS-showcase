import type { JSX } from "solid-js";

import { Button } from "../Button/Button.tsx";
import { Dialog } from "../Dialog/Dialog.tsx";

export type DiscardDialogProps = {
	open: boolean;
	/** What would be thrown away: "new event" asks "Discard new event?". */
	label?: string;
	/** Keep editing, Escape, an outside click or the close button. */
	onKeep: () => void;
	onDiscard: () => void;
};

/**
 * Asks before a sheet throws a changed draft away (`Sheet.Root
 * confirmClose`). The sheet steps aside for it in one morph, handing it its
 * source: Keep editing morphs it back into the sheet, Discard closes it as
 * the sheet would have closed. Any other way out keeps the draft.
 */
export function DiscardDialog(props: DiscardDialogProps): JSX.Element {
	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(isOpen) => {
				if (!isOpen) props.onKeep();
			}}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>
						{props.label
							? `Discard ${props.label}?`
							: "Discard changes?"}
					</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>What you entered will be lost.</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Cancel>Keep editing</Dialog.Cancel>
					<Button
						variant="secondary"
						onClick={() => {
							props.onDiscard();
						}}
					>
						Discard
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
