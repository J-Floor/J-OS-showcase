import { Button, Icon } from "@j-os/design-system";
import { type JSX, Show, createSignal } from "solid-js";

import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { ChangeRoleDialog } from "../actions/ChangeRoleDialog.tsx";
import { useMemberActions } from "../actions/memberActions.ts";
import { eligible, type ActionDescriptor } from "../actions/shortcuts.ts";
import { useTriage } from "../actions/triage.ts";
import {
	applyMove,
	type MemberRow,
	memberColumns,
	memberGroup,
} from "../columns/memberColumns.tsx";
import { useMembers } from "../data/useMembers.ts";

import { RosterTab } from "./RosterTab.tsx";
import type { TabProps } from "./TabProps.ts";

/**
 * Members tab: members / board / kicked-out grouped, with batch triage and a
 * change-role dialog. The roster + drawer scaffold is {@link RosterTab}; this
 * file owns what is member-specific — the change-role flows and the selection
 * bar.
 *
 * Change role has two flows, two dialogs. The BATCH one (`roleOpen`) lives in the
 * selection bar over the checked rows. The SINGLE one (`singleRoleOpen` +
 * `roleTarget`) is for the `R` key and the drawer footer — those act on one
 * person, who has no checkbox selection, so the batch dialog (mounted only while
 * rows are selected) never opened for them; this one is passed as `extra` so it
 * exists to be opened for the drawer/focused person.
 */
export function MembersTab(props: TabProps): JSX.Element {
	const members = useMembers();
	const triage = useTriage();
	const confirm = useConfirm();
	const [roleOpen, setRoleOpen] = createSignal(false);
	const [singleRoleOpen, setSingleRoleOpen] = createSignal(false);
	const [roleTarget, setRoleTarget] = createSignal<MemberRow>();
	const memberActions = useMemberActions({
		onChangeRole: (person) => {
			setRoleTarget(person);
			setSingleRoleOpen(true);
		},
		group: memberGroup,
	});
	function kickOutAction(): ActionDescriptor<MemberRow> {
		const action = memberActions.actions().find((a) => a.id === "kick");
		if (!action) throw new Error("useMemberActions: no 'kick' descriptor");
		return action;
	}

	return (
		<RosterTab<MemberRow>
			tab={props}
			data={() => members.data()}
			columns={() => memberColumns()}
			groupBy="group"
			actions={memberActions.actions}
			extra={
				<Show when={roleTarget()}>
					{(person) => (
						<ChangeRoleDialog
							open={singleRoleOpen()}
							onOpenChange={setSingleRoleOpen}
							count={1}
							states={[`${person().tier}.${person().stage}`]}
							onMove={(move) =>
								applyMove(triage, [person()._id], move)
							}
						/>
					)}
				</Show>
			}
			batchActions={(p) => {
				// The rows Kick out applies to — the SAME rule the per-row button
				// and the `K` key ask, via `kickOutAction().can`.
				function targets() {
					return eligible(kickOutAction(), p.selectedRows);
				}
				return (
					<>
						<Show when={p.selectedRows.length > 0}>
							<Button
								onClick={() => {
									setRoleOpen(true);
								}}
							>
								<Icon>{ICONS.role}</Icon>Change role
							</Button>
						</Show>
						<ChangeRoleDialog
							open={roleOpen()}
							onOpenChange={setRoleOpen}
							count={p.selectedRows.length}
							states={p.selectedRows.map<StateId>(
								(r) => `${r.tier}.${r.stage}`
							)}
							onMove={(move) => {
								// Read the tracked selection synchronously (before the
								// promise) so `solid/reactivity` stays happy, then let
								// the dialog await the whole batch before it closes.
								const ids = p.selectedRows.map((r) => r._id);
								return applyMove(triage, ids, move).then(() => {
									p.clearSelection();
								});
							}}
						/>
						<Show when={targets().length > 0}>
							<Button
								variant="secondary"
								onClick={() => {
									void (async () => {
										const rows = targets();
										if (
											await confirm({
												title: "Kick out?",
												message: `Revoke access for ${rows.length} person(s)? They'll be moved to Kicked out, keeping their whole history.`,
												confirmLabel: "Kick out",
												tone: "danger",
											})
										)
											await p.runBatch(
												rows,
												triage.kickOut,
												p.clearSelection
											);
									})();
								}}
							>
								<Icon>{ICONS.kickOut}</Icon>Kick out
							</Button>
						</Show>
					</>
				);
			}}
		/>
	);
}
