import { Button, Icon, Table } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { kickOutPrompt, type KickOutKind } from "../actions/kickOutPrompt.ts";
import { useTriage } from "../actions/triage.ts";

import { useRosterBatch } from "./RosterTab.tsx";

/**
 * The selection bar's Kick out: confirms, then kicks out `rows` (the checked
 * rows it applies to) one by one and clears the selection. A child of the
 * tab's `Table.BatchActions`.
 */
export function BatchKickOut(props: {
	kind: KickOutKind;
	rows: PersonRow[];
}): JSX.Element {
	const triage = useTriage();
	const confirm = useConfirm();
	const runBatch = useRosterBatch();
	const selection = Table.useSelection<PersonRow>();

	return (
		<Button
			variant="secondary"
			onClick={() => {
				void (async () => {
					const rows = props.rows;
					if (await confirm(kickOutPrompt(props.kind, rows.length)))
						await runBatch(rows, triage.kickOut, selection.clear);
				})();
			}}
		>
			<Icon>{ICONS.kickOut}</Icon>Kick out
		</Button>
	);
}
