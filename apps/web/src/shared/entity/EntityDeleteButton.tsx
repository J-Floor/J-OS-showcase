import { Button, Icon } from "@j-os/design-system";
import type { ResultAsync } from "neverthrow";
import type { JSX } from "solid-js";

import type { ClientError } from "../../lib/call.ts";
import { useConfirm, type ConfirmOptions } from "../confirm.tsx";
import { createActionError } from "../createActionError.ts";
import { ICONS } from "../icons.ts";
import { InlineError } from "../InlineError.tsx";

import { createEntityRemove } from "./entityCommands.ts";

/** Delete for an entity sheet's footer: confirms, deletes, and closes the
 *  sheet once the row is gone. A refusal shows beside the button for the
 *  row it was made for, and the sheet stays. */
export function EntityDeleteButton(props: {
	/** The row the sheet shows; a refusal belongs to it. */
	key: string;
	confirm: ConfirmOptions;
	remove: () => ResultAsync<unknown, ClientError>;
	onClose: () => void;
	/** The button's label, e.g. "Delete perk". */
	children: JSX.Element;
}): JSX.Element {
	const confirm = useConfirm();
	const failure = createActionError(() => props.key);
	const removeRow = createEntityRemove({
		remove: () => props.remove(),
		failure,
		onClose: () => {
			props.onClose();
		},
	});
	async function remove(): Promise<void> {
		const isOk = await confirm(props.confirm);
		if (!isOk) return;
		await removeRow(props.key);
	}
	return (
		<>
			<InlineError message={failure.error()} />
			<Button variant="tertiary" onClick={() => void remove()}>
				<Icon>{ICONS.delete}</Icon> {props.children}
			</Button>
		</>
	);
}
