import { Button, Icon } from "@j-os/design-system";
import { type JSX, Show, createMemo } from "solid-js";

import { useConfirm } from "../../../shared/confirm.tsx";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { useGuestActions } from "../actions/guestActions.ts";
import { useTriage } from "../actions/triage.ts";
import {
	guestColumns,
	guestStatus,
	type GuestRow,
} from "../columns/guestColumns.tsx";
import { hostOptions } from "../columns/hostOptions.ts";
import { useGuests } from "../data/communityData.tsx";

import { RosterTab } from "./RosterTab.tsx";
import type { TabProps } from "./TabProps.ts";

/**
 * Guests tab: guest people in a selectable roster, with batch triage (kick out /
 * upgrade to member) over the checked rows. The roster + drawer scaffold is
 * {@link RosterTab}; this file supplies only what is guest-specific — the query,
 * the host-aware columns, the actions, and the selection bar.
 */
export function GuestsTab(props: TabProps): JSX.Element {
	const guests = useGuests();
	const boardLevel = useBoardLevel();
	const triage = useTriage();
	const confirm = useConfirm();
	const guestActions = useGuestActions();
	// "Hosted by" filters on an enum of the current board, so the options only
	// exist once the board list has loaded. Memoised: rebuilding the columns on every
	// render would remount every cell.
	const columns = createMemo(() =>
		guestColumns(hostOptions(boardLevel.data() ?? []))
	);

	return (
		<RosterTab<GuestRow>
			tab={props}
			data={() =>
				guests.isLoading() ? undefined : (guests.data() ?? [])
			}
			columns={columns}
			groupBy="guestStatus"
			initialColumnSorting={[{ id: "joinedAt", desc: true }]}
			actions={guestActions.actions}
			batchActions={(p) => {
				// Kick out only applies to still-active guests (expired ones
				// already lost access); hide it when none qualify.
				function stillActive() {
					return p.selectedRows.filter(
						(r) => guestStatus(r) === "active"
					);
				}
				return (
					<>
						<Show when={stillActive().length > 0}>
							<Button
								variant="secondary"
								onClick={() => {
									void (async () => {
										const rows = stillActive();
										if (
											await confirm({
												title: "Kick out?",
												message: `Revoke guest access for ${rows.length} person(s)? They'll be moved to Kicked out, keeping their whole history.`,
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
						<Button
							onClick={() => {
								void (async () => {
									const rows = p.selectedRows;
									if (
										await confirm({
											title: "Upgrade to member?",
											message: `Promote ${rows.length} guest(s) to full members? They'll each be emailed an invite.`,
											confirmLabel: "Upgrade",
										})
									)
										await p.runBatch(
											rows,
											triage.upgradeToMember,
											p.clearSelection
										);
								})();
							}}
						>
							<Icon>{ICONS.upgradeToMember}</Icon>Upgrade to
							member
						</Button>
					</>
				);
			}}
		/>
	);
}
