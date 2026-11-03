import { Table } from "@j-os/design-system";
import { type JSX, Show, createSignal } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import { BatchActionButton } from "../../../shared/actions/BatchActionButton.tsx";
import type {
	ActionDescriptor,
	ActionOutcome,
} from "../../../shared/actions/shortcuts.ts";
import { ChangeRoleDialog } from "../actions/ChangeRoleDialog.tsx";
import { useMemberActions } from "../actions/memberActions.ts";
import { useTriage } from "../actions/triage.ts";
import {
	applyMove,
	memberColumns,
	memberGroup,
} from "../columns/memberColumns.tsx";
import { useMembers } from "../data/communityData.tsx";

import { RosterTab } from "./RosterTab.tsx";
import { batchableAction } from "./rowAction.ts";
import type { TabProps } from "./TabProps.ts";

/** Who a Change role dialog applies to, and who hears how it ended: moved
 *  (not refused), or closed without a move (`undefined`). */
type RoleTarget = {
	ids: Id<"people">[];
	states: StateId[];
	onSettled?: (outcome: ActionOutcome) => void;
};

/** The selection bar: change role for, and kick out, the checked rows.
 *  `actions` are the tab's row actions: a button runs the same batch as its
 *  key pressed with rows checked. */
function MemberBatchActions(props: {
	actions: () => ActionDescriptor<PersonRow>[];
}): JSX.Element {
	return (
		<>
			<BatchActionButton
				action={batchableAction(props.actions(), "role")}
			/>
			<BatchActionButton
				action={batchableAction(props.actions(), "kick")}
				variant="secondary"
			/>
		</>
	);
}

/**
 * The Members sheet's own setup, shared by the tab and the peek: the action
 * descriptors and the one change-role dialog both ways in feed.
 *
 * Change role has one dialog for every way in: over the checked rows (the
 * selection bar's button, or `R` with rows checked), whose batch settles when
 * the dialog closes, and for one person (`R` on a row, the sheet footer).
 * Render `RoleDialog` BESIDE the roster, not in the selection bar: the bar
 * only exists while rows are checked, and a successful move clears the
 * selection, which would unmount the dialog mid-close.
 */
export function useMembersSheet() {
	const triage = useTriage();
	const [isRoleOpen, setRoleOpen] = createSignal(false);
	// Kept after the dialog closes: dropping it would unmount the dialog
	// before its exit animation ran.
	const [roleTarget, setRoleTarget] = createSignal<RoleTarget>();
	function openRoleDialog(target: RoleTarget): void {
		setRoleTarget(target);
		setRoleOpen(true);
	}
	const memberActions = useMemberActions({
		onChangeRole: (person) => {
			openRoleDialog({
				ids: [person._id],
				states: [`${person.tier}.${person.stage}`],
			});
		},
		onChangeRoles: (people) =>
			new Promise((resolve) => {
				openRoleDialog({
					ids: people.map((person) => person._id),
					states: people.map<StateId>(
						(person) => `${person.tier}.${person.stage}`
					),
					onSettled: resolve,
				});
			}),
		group: memberGroup,
	});
	function RoleDialog(): JSX.Element {
		return (
			<Show when={roleTarget()}>
				{(target) => (
					<ChangeRoleDialog
						open={isRoleOpen()}
						onOpenChange={(isOpen) => {
							setRoleOpen(isOpen);
							// After a move this settles nothing: it already has.
							if (!isOpen) target().onSettled?.(undefined);
						}}
						count={target().ids.length}
						states={target().states}
						onMove={(move) =>
							applyMove(triage, target().ids, move).then(
								(result) => {
									if (result.isOk())
										target().onSettled?.({
											refused: false,
										});
									return result;
								}
							)
						}
					/>
				)}
			</Show>
		);
	}

	return {
		scope: "members",
		actions: memberActions.actions,
		RoleDialog,
	} as const;
}

/**
 * Members tab: members / board / kicked-out grouped, with batch triage and a
 * change-role dialog. The roster + sheet scaffold is {@link RosterTab}; this
 * file owns what is member-specific — the selection bar. The change-role flow
 * is {@link useMembersSheet}'s.
 */
export function MembersTab(props: TabProps): JSX.Element {
	const members = useMembers();
	const sheet = useMembersSheet();

	return (
		<>
			<RosterTab.Root<PersonRow>
				tab={props}
				scope={sheet.scope}
				data={() => members.data()}
				columns={() => memberColumns()}
				groupBy="group"
				actions={sheet.actions}
			>
				<Table.BatchActions>
					<MemberBatchActions actions={sheet.actions} />
				</Table.BatchActions>
			</RosterTab.Root>
			<sheet.RoleDialog />
		</>
	);
}
