import { Icon } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { doorOpensFor } from "../../../convex/lib/derive.ts";
import { canLock, type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { RowActionButton } from "../../shared/actions/RowActions.tsx";
import { useQuery } from "../../shared/data/useQuery.ts";

import { DOORS_TARGET, createDoorKeys } from "./doorActions.ts";
import { createDoorActuation } from "./doorActuation.ts";
import { LOCKABLE_SLOTS, createDoorPositions } from "./doorPositions.ts";
import { DoorSlot } from "./DoorSlot.tsx";
import { createDoorStatusHolds } from "./doorStatusHolds.ts";
import { type SlotView, viewForReading } from "./doorView.ts";
import { SpaceCard } from "./SpaceCard.tsx";
import styles from "./UnlockCard.module.scss";

/**
 * Access-tab card: unlock or lock a door from the app — the way everyone opens
 * the doors. Two gates, not one: this card renders only while the person's
 * door opens for them right now (`doorOpensFor(person, now)` — so not for an
 * expired guest, a force_off, or anyone else the door is shut for), and the
 * server's own gate (`doorActionContext`, the same
 * `doorOpensFor` check) decides whether an action goes through. Hiding the
 * card only spares someone a button the server would refuse; it gates
 * nothing by itself.
 * While the person is still loading the card shows as a loading card. A
 * door's position is never remembered across mounts: its slot shows a
 * button-shaped skeleton until this mount's own first fresh read lands.
 *
 * One panel, no tabs: each door shows the action its bolt calls for — Unlock
 * when locked, Lock when unlocked, both side by side when the position is
 * unknown — and a door that cannot lock (`LOCK_CAPABILITIES`) always shows
 * Unlock. An offline lock shows a note instead of buttons. The header's
 * refresh button re-reads the bolt.
 *
 * Each tap fetches a fresh presence token (proof this device is on the J floor
 * network) and hands it to the unlock or lock action. Once the server accepts
 * the action, the card follows its attempt (`doorLog.attempt`) and says the
 * door is open only after the door has actually reacted. The countdown then
 * runs for `durationMs` on the phone's own clock, from the moment the
 * reaction arrives: the attempt's `actuatedAt` is the server's clock, and a
 * phone's can be seconds off. A door that never reacts says so.
 */
export function UnlockCard(props: { active?: boolean }): JSX.Element {
	const person = useQuery(api.people.getCurrentPerson, {});
	const holds = createDoorStatusHolds((slot) => {
		if (canLock(slot)) doors.readFresh(slot);
	});
	const doors = createDoorPositions({
		enabled: canSeeDoors,
		hasStatus: (slot) => holds.statuses().has(slot),
	});
	const { actuate } = createDoorActuation({ holds, doors });

	/** Whether the person's door access is granted right now; false while
	 *  loading. */
	function canSeeDoors(): boolean {
		const me = person.data();
		return me ? doorOpensFor(me, Date.now()) : false;
	}

	function slotView(slot: LockSlot): SlotView {
		const status = holds.statuses().get(slot);
		if (status) return { kind: "text", status };
		return canLock(slot)
			? viewForReading(slot, doors.position(slot))
			: { kind: "button", action: "unlock" };
	}

	const refresh = createDoorRefresh(holds, doors);
	const keys = createDoorKeys({
		view: slotView,
		press: (slot, action) => void actuate(slot, action),
		canRefresh: refresh.canRefresh,
		refresh: refresh.refresh,
		isChecking: () => LOCKABLE_SLOTS.some((slot) => doors.isChecking(slot)),
		// The keys follow the card: only while it is on screen (the person's
		// door opens, the Access tab is the one showing).
		active: () => props.active === true && canSeeDoors(),
	});

	function door(slot: LockSlot): JSX.Element {
		return (
			<DoorSlot
				slot={slot}
				view={() => slotView(slot)}
				actions={keys.doors[slot]}
				onPress={(action) => void actuate(slot, action)}
			/>
		);
	}

	return (
		<Show when={person.data() === undefined || canSeeDoors()}>
			<SpaceCard.Root loading={person.data() === undefined}>
				<SpaceCard.Header
					title="Doors"
					subtitle="An internet connection is required."
				>
					<SpaceCard.Action>
						<RowActionButton
							action={keys.checkAgain}
							row={DOORS_TARGET}
						/>
					</SpaceCard.Action>
				</SpaceCard.Header>
				<SpaceCard.Body>
					<div class={styles.doors}>
						{door("upstairs")}
						<Route />
						{door("downstairs")}
					</div>
				</SpaceCard.Body>
				<SpaceCard.Skeleton />
			</SpaceCard.Root>
		</Show>
	);
}

/** The header's "Check again": re-reads every bolt that is not held on a
 *  status line, and whether it can run right now. */
function createDoorRefresh(
	holds: ReturnType<typeof createDoorStatusHolds>,
	doors: ReturnType<typeof createDoorPositions>
) {
	return {
		refresh: (): void => {
			// A check already running is not started again (the button is
			// loading then, and a key press must not get past that).
			if (LOCKABLE_SLOTS.some((slot) => doors.isChecking(slot))) return;
			for (const slot of LOCKABLE_SLOTS)
				if (!holds.statuses().has(slot)) doors.recheck(slot);
		},
		canRefresh: (): boolean =>
			!LOCKABLE_SLOTS.every((slot) => holds.statuses().has(slot)),
	};
}

/** "[stairs] or [elevator]" between the buttons: how to get upstairs. */
function Route(): JSX.Element {
	return (
		<div class={styles.route}>
			<Icon>stairs</Icon>
			<span>or</span>
			<Icon>elevator</Icon>
		</div>
	);
}
