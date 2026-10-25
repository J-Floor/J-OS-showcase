import { Button, Icon, Table } from "@j-os/design-system";
import { type JSX, Show, createSignal } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";
import { invariant } from "../../../../convex/lib/result.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import { ICONS } from "../../../shared/icons.ts";
import { ChangeRoleDialog } from "../actions/ChangeRoleDialog.tsx";
import { useMemberActions } from "../actions/memberActions.ts";
import { eligible, type ActionDescriptor } from "../actions/shortcuts.ts";
import { useTriage } from "../actions/triage.ts";
import {
	applyMove,
	memberColumns,
	memberGroup,
} from "../columns/memberColumns.tsx";
import { useMembers } from "../data/communityData.tsx";

import { BatchKickOut } from "./BatchKickOut.tsx";
import { RosterTab } from "./RosterTab.tsx";
import type { TabProps } from "./TabProps.ts";

/** Who a Change role dialog applies to, and what to do once they have moved. */
type RoleTarget = {
	ids: Id<"people">[];
	states: StateId[];
	onMoved?: () => void;
};

/** The selection bar: change role for, and kick out, the checked rows. */
function MemberBatchActions(props: {
	onChangeRole: (target: RoleTarget) => void;
	kickOutAction: () => ActionDescriptor<PersonRow>;
}): JSX.Element {
	const selection = Table.useSelection<PersonRow>();

	// The rows Kick out applies to — the SAME rule the per-row button
	// and the `K` key ask, via `kickOutAction().can`.
	function targets() {
		return eligible(props.kickOutAction(), selection.rows());
	}

	return (
		<>
			<Show when={selection.rows().length > 0}>
				<Button
					onClick={() => {
						const rows = selection.rows();
						props.onChangeRole({
							ids: rows.map((row) => row._id),
							states: rows.map<StateId>(
								(row) => `${row.tier}.${row.stage}`
							),
							// Clearing the selection takes this bar away. The dialog is
							// not in it, so it stays up to animate out.
							onMoved: selection.clear,
						});
					}}
				>
					<Icon>{ICONS.role}</Icon>Change role
				</Button>
			</Show>
			<Show when={targets().length > 0}>
				<BatchKickOut kind="member" rows={targets()} />
			</Show>
		</>
	);
}

/**
 * Members tab: members / board / kicked-out grouped, with batch triage and a
 * change-role dialog. The roster + sheet scaffold is {@link RosterTab}; this
 * file owns what is member-specific — the change-role flow and the selection
 * bar.
 *
 * Change role has one dialog for both ways in: the selection bar's button
 * (over the checked rows) and the `R` key / sheet footer (one person, who has
 * no checkbox selection). It sits BESIDE the roster, not in the selection
 * bar: the bar only exists while rows are checked, and a successful move
 * clears the selection, which would unmount the dialog mid-close.
 */
export function MembersTab(props: TabProps): JSX.Element {
	const members = useMembers();
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
		group: memberGroup,
	});
	function kickOutAction(): ActionDescriptor<PersonRow> {
		const action = memberActions
			.actions()
			.find((candidate) => candidate.id === "kick");
		invariant(action, "useMemberActions: no 'kick' descriptor");
		return action;
	}

	return (
		<>
			<RosterTab.Root<PersonRow>
				tab={props}
				scope="members"
				data={() => members.data()}
				columns={() => memberColumns()}
				groupBy="group"
				actions={memberActions.actions}
			>
				<Table.BatchActions>
					<MemberBatchActions
						onChangeRole={openRoleDialog}
						kickOutAction={kickOutAction}
					/>
				</Table.BatchActions>
			</RosterTab.Root>
			<Show when={roleTarget()}>
				{(target) => (
					<ChangeRoleDialog
						open={isRoleOpen()}
						onOpenChange={setRoleOpen}
						count={target().ids.length}
						states={target().states}
						onMove={(move) =>
							applyMove(triage, target().ids, move).then(
								(result) => {
									if (result.isOk()) target().onMoved?.();
									return result;
								}
							)
						}
					/>
				)}
			</Show>
		</>
	);
}
