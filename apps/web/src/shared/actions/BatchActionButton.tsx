import { Table } from "@j-os/design-system";
import { Show, createMemo, type JSX } from "solid-js";

import { ActionButton } from "./ActionButton.tsx";
import { batchOf, type BatchableAction } from "./batchOf.ts";
import { isRunning } from "./runAction.ts";
import { eligible } from "./shortcuts.ts";

/**
 * A selection bar's button for a row action that batches (`runBatch`): runs
 * it once over the checked rows it applies to, and unchecks them once they
 * all went through. Hidden while none of the checked rows qualify.
 *
 * The same run as the action's key pressed with rows checked
 * (`createActionKeys`, through `batchOf`), so the button shows the key's
 * chip, and its spinner whichever of the two started the run. A child of
 * `Table.BatchActions`.
 */
export function BatchActionButton<Row extends Record<string, unknown>>(props: {
	action: BatchableAction<Row>;
	variant?: "primary" | "secondary" | "tertiary";
}): JSX.Element {
	const selection = Table.useSelection<Row>();
	function isBatchRunning(): boolean {
		return isRunning(batchOf(props.action), []);
	}
	// The rows the action applies to, held while its batch runs: they stop
	// qualifying as their writes land, and the button keeps its spinner (and
	// stays enabled to show it) until the last one has.
	const targets = createMemo<Row[]>(
		(held) =>
			isBatchRunning() ? held : eligible(props.action, selection.rows()),
		[]
	);
	return (
		<Show when={targets().length > 0}>
			<ActionButton
				action={batchOf(props.action)}
				target={targets()}
				variant={props.variant}
				onSettled={(outcome) => {
					if (outcome?.refused === false) selection.clear();
				}}
			/>
		</Show>
	);
}
