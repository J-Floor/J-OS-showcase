import { type JSX } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { RoleChooser } from "../actions/RoleChooser.tsx";
import { useTriage } from "../actions/triage.ts";
import { applyMove } from "../columns/memberColumns.tsx";

import styles from "./RoleSection.module.scss";

/**
 * Change this person's role from inside the sheet.
 *
 * Unlocking the sheet made every profile field editable while the one thing
 * the board actually changes about somebody — their role — stayed frozen text,
 * so the only way to move a member or guest was to close the sheet and find
 * their row again.
 *
 * The chooser is the same component the dialog uses, so the destinations on
 * offer and the edge each one takes are decided in one place. Committing is the
 * same two steps as the dialog too — pick, then confirm — rather than applying
 * on selection: a role change fires emails and reconciles the door, which is
 * not something a stray tap should do.
 */
export function RoleSection(props: { person: Doc<"people"> }): JSX.Element {
	const triage = useTriage();

	return (
		<div class={styles.section}>
			<RoleChooser.Root
				states={[`${props.person.tier}.${props.person.stage}`]}
				onMove={(move) => applyMove(triage, [props.person._id], move)}
			>
				<div class={styles.actions}>
					<RoleChooser.Commit />
				</div>
			</RoleChooser.Root>
		</div>
	);
}
