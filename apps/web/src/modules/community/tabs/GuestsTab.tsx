import { Button, Icon, Table } from "@j-os/design-system";
import { type JSX, Show, createMemo } from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { useGuestActions } from "../actions/guestActions.ts";
import { useTriage } from "../actions/triage.ts";
import { guestColumns, guestStatus } from "../columns/guestColumns.tsx";
import { hostOptions } from "../columns/hostOptions.ts";
import { useGuests } from "../data/communityData.tsx";

import { BatchKickOut } from "./BatchKickOut.tsx";
import { RosterTab, useRosterBatch } from "./RosterTab.tsx";
import type { TabProps } from "./TabProps.ts";

/** The selection bar: kick out (still-active guests only) and upgrade to
 *  member, over the checked rows. */
function GuestBatchActions(): JSX.Element {
	const triage = useTriage();
	const confirm = useConfirm();
	const runBatch = useRosterBatch();
	const selection = Table.useSelection<PersonRow>();

	// Kick out only applies to still-active guests (expired ones
	// already lost access); hide it when none qualify.
	function stillActive() {
		return selection.rows().filter((row) => guestStatus(row) === "active");
	}

	return (
		<>
			<Show when={stillActive().length > 0}>
				<BatchKickOut kind="guest" rows={stillActive()} />
			</Show>
			<Button
				onClick={() => {
					void (async () => {
						const rows = selection.rows();
						if (
							await confirm({
								title: "Upgrade to member?",
								message: `Promote ${String(rows.length)} guest(s) to full members? They'll each be emailed an invite.`,
								confirmLabel: "Upgrade",
							})
						)
							await runBatch(
								rows,
								triage.upgradeToMember,
								selection.clear
							);
					})();
				}}
			>
				<Icon>{ICONS.upgradeToMember}</Icon>Upgrade to member
			</Button>
		</>
	);
}

/** The Guests sheet's own setup, shared by the tab and the peek: the action
 *  descriptors behind the footer buttons and the action keys. */
export function useGuestsSheet() {
	return { scope: "guests", actions: useGuestActions().actions } as const;
}

/**
 * Guests tab: guest people in a selectable roster, with batch triage (kick out /
 * upgrade to member) over the checked rows. The roster + sheet scaffold is
 * {@link RosterTab}; this file supplies only what is guest-specific — the query,
 * the host-aware columns, the actions, and the selection bar.
 */
export function GuestsTab(props: TabProps): JSX.Element {
	const guests = useGuests();
	const boardLevel = useBoardLevel();
	const sheet = useGuestsSheet();
	// "Hosted by" filters on an enum of the current board, so the options only
	// exist once the board list has loaded. Memoised: rebuilding the columns on every
	// render would remount every cell.
	const columns = createMemo(() =>
		guestColumns(hostOptions(boardLevel.data() ?? []))
	);

	return (
		<RosterTab.Root<PersonRow>
			tab={props}
			scope={sheet.scope}
			data={() => guests.data()}
			columns={columns}
			groupBy="guestStatus"
			initialColumnSorting={[{ id: "joinedAt", desc: true }]}
			actions={sheet.actions}
		>
			<Table.BatchActions>
				<GuestBatchActions />
			</Table.BatchActions>
		</RosterTab.Root>
	);
}
