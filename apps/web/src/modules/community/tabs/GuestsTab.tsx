import { Table } from "@j-os/design-system";
import { type JSX, createMemo } from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { BatchActionButton } from "../../../shared/actions/BatchActionButton.tsx";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { useGuestActions } from "../actions/guestActions.ts";
import { guestColumns } from "../columns/guestColumns.tsx";
import { hostOptions } from "../columns/hostOptions.ts";
import { useGuests } from "../data/communityData.tsx";

import { RosterTab } from "./RosterTab.tsx";
import { batchableAction } from "./rowAction.ts";
import type { TabProps } from "./TabProps.ts";

/** The selection bar: kick out and upgrade to member, over the checked
 *  rows each applies to. `actions` are the tab's row actions: a button runs
 *  the same batch as its key pressed with rows checked. */
function GuestBatchActions(props: {
	actions: () => ActionDescriptor<PersonRow>[];
}): JSX.Element {
	return (
		<>
			<BatchActionButton
				action={batchableAction(props.actions(), "kick")}
				variant="secondary"
			/>
			<BatchActionButton
				action={batchableAction(props.actions(), "member")}
			/>
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
				<GuestBatchActions actions={sheet.actions} />
			</Table.BatchActions>
		</RosterTab.Root>
	);
}
