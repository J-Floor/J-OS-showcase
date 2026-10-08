import { Button, Icon, IconButton } from "@j-os/design-system";
import { useAction, useQuery } from "convex-solidjs";
import {
	For,
	Match,
	Switch,
	Show,
	createComputed,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	type JSX,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { DoorAttemptView } from "../../../convex/doorLog.ts";
import { doorOpensFor } from "../../../convex/lib/derive.ts";
import {
	LOCK_CAPABILITIES,
	canLock,
	type LockSlot,
} from "../../../convex/lib/doorLocks.ts";
import { type DoorAction } from "../../../convex/lib/doorProvider.ts";
import { ICONS } from "../../shared/icons.ts";
import { userErrorMessage } from "../../shared/userErrorMessage.ts";

import { createDoorAttempt, type DoorAttemptWatch } from "./doorAttempt.ts";
import { LOCKABLE_SLOTS, createDoorPositions } from "./doorPositions.ts";
import { LOCK_SLOTS, slotInfo } from "./lockSlots.ts";
import { fetchPresenceToken } from "./presence.ts";
import { SpaceCard } from "./SpaceCard.tsx";
import styles from "./UnlockCard.module.scss";

const STATUS_HOLD_MS = 5000;
const COUNTDOWN_TICK_MS = 1000;

/** What replaces a door's button: the line of text and how it is coloured. */
type DoorStatus = {
	tone: "muted" | "warning" | "error";
	text: string;
};

const CHECKING_TEXT = "Checking door…";
const SENDING_TEXT = "Sending…";
const WAKING_TEXT = "Waking the door…";
/** The copy and icon of each action, so nothing else branches on which. */
const ACTION_COPY: Record<
	DoorAction,
	{
		label: string;
		icon: string;
		progress: string;
		verb: string;
		sent: string;
		errorFallback: string;
	}
> = {
	unlock: {
		label: "Unlock",
		icon: ICONS.unlock,
		progress: "Door is unlocking",
		verb: "opening",
		sent: "Sent — the door should open shortly.",
		errorFallback: "Couldn't open the door.",
	},
	lock: {
		label: "Lock",
		icon: ICONS.lock,
		progress: "Door is locking",
		verb: "locking",
		sent: "Sent — the door should lock shortly.",
		errorFallback: "Couldn't lock the door.",
	},
};
const DOOR_ACTIONS = [
	"unlock",
	"lock",
] as const satisfies readonly DoorAction[];

/** What a door's slot shows: a line of text (an action's status, or the
 *  bolt's own state), one button, or both actions side by side when the
 *  bolt's position is unknown. */
type SlotView =
	| { kind: "text"; status: DoorStatus }
	| { kind: "button"; action: DoorAction }
	| { kind: "both" };

function offsiteText(action: DoorAction): string {
	return `Join the J floor Wi-Fi to ${action} — the Wi-Fi card has the details.`;
}

function openText(remainingMs: number): string {
	return `Open — push now (${Math.max(1, Math.ceil(remainingMs / 1000))}s)`;
}

function noResponseText(label: string): string {
	return `${label} door didn't respond — try again.`;
}

function offlineText(label: string): string {
	return `${label} lock is offline — try again in a moment.`;
}

/** Copy for the statuses the unlock and lock actions return besides "ok". */
function resultText(
	status: "offline" | "busy" | "debounced",
	label: string,
	action: DoorAction
): string {
	const { verb } = ACTION_COPY[action];
	switch (status) {
		case "debounced":
			return `${label} door is already ${verb}.`;
		case "offline":
			return offlineText(label);
		case "busy":
			return `${label} door is still ${verb} — wait a few seconds before trying again.`;
	}
}

/**
 * Access-tab card: unlock or lock a door from the app — the way everyone opens
 * the doors. Two gates, not one: this card renders only while the person's
 * door opens for them right now (`doorOpensFor(person, now)` — so not for an
 * expired guest, a force_off, or anyone else the door is shut for), and the
 * server's own gate (`doorActionContext`, the same
 * `doorOpensFor` check) decides whether an action goes through. Hiding the
 * card only spares someone a button the server would refuse; it gates
 * nothing by itself.
 * Hidden while the person is still loading.
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
export function UnlockCard(): JSX.Element {
	const person = useQuery(api.people.getCurrentPerson, {});
	const unlock = useAction(api.doorActions.unlockDoor);
	const lock = useAction(api.doorActions.lockDoor);
	/** What stands in for each door's buttons, from the tap until its hold
	 *  ends — never earlier, since the server refuses repeats until then. */
	const [statuses, setStatuses] = createSignal<
		ReadonlyMap<LockSlot, DoorStatus>
	>(new Map());
	const holds = new Map<LockSlot, () => void>();
	/** Each door's attempt subscription. */
	const attempts: Record<LockSlot, DoorAttemptWatch> = {
		downstairs: createDoorAttempt(),
		upstairs: createDoorAttempt(),
	};
	/** The action each door is waiting to hear back about: set from the
	 *  server accepting it until its attempt says how the door reacted. */
	const awaiting = new Map<LockSlot, DoorAction>();
	const doors = createDoorPositions({
		enabled: canSeeDoors,
		hasStatus: (slot) => statuses().has(slot),
	});
	let disposed = false;
	onCleanup(() => {
		disposed = true;
		for (const stop of holds.values()) stop();
	});
	for (const { slot } of LOCK_SLOTS)
		createEffect(
			on(attempts[slot].result, (view) => {
				settle(slot, view);
			})
		);

	function setStatus(slot: LockSlot, status: DoorStatus | null) {
		setStatuses((m) => {
			const next = new Map(m);
			if (status) next.set(slot, status);
			else next.delete(slot);
			return next;
		});
	}

	/** Shows `status` for `slot`, then brings its buttons back after `ms`.
	 *  With `countdown`, the text is rebuilt every second from the time
	 *  left. */
	function hold(
		slot: LockSlot,
		status: DoorStatus,
		ms: number,
		countdown?: (remainingMs: number) => string
	) {
		if (disposed) return;
		holds.get(slot)?.();
		setStatus(slot, status);
		let remaining = ms;
		const interval = countdown
			? setInterval(() => {
					remaining -= COUNTDOWN_TICK_MS;
					if (remaining <= 0) return;
					setStatus(slot, { ...status, text: countdown(remaining) });
				}, COUNTDOWN_TICK_MS)
			: undefined;
		const timer = setTimeout(() => {
			stop();
			setStatus(slot, null);
			if (canLock(slot)) doors.readFresh(slot);
		}, ms);
		function stop() {
			clearInterval(interval);
			clearTimeout(timer);
			holds.delete(slot);
		}
		holds.set(slot, stop);
	}

	function warn(slot: LockSlot, text: string) {
		hold(slot, { tone: "warning", text }, STATUS_HOLD_MS);
	}

	/** The provider took the command, but there is no attempt to follow:
	 *  the door still acts, so this is not a failure to retry. */
	function sentUnfollowed(slot: LockSlot, action: DoorAction) {
		hold(
			slot,
			{ tone: "muted", text: ACTION_COPY[action].sent },
			STATUS_HOLD_MS
		);
	}

	/** Ends the wait on `slot`'s attempt once the server knows how it went:
	 *  the door reacted (hold for `durationMs`, counted from now), it never
	 *  did, or there is no attempt to follow. While the attempt loads or is
	 *  still `accepted`, the slot keeps waiting. */
	function settle(slot: LockSlot, view: DoorAttemptView | null | undefined) {
		const action = awaiting.get(slot);
		if (
			action === undefined ||
			view === undefined ||
			(view !== null && view.actuation === "accepted")
		)
			return;
		awaiting.delete(slot);
		attempts[slot].stop();
		if (view === null) {
			sentUnfollowed(slot, action);
			return;
		}
		if (view.actuation === "unconfirmed") {
			warn(slot, noResponseText(slotInfo(slot).label));
			return;
		}
		const momentary =
			action === "unlock" && LOCK_CAPABILITIES[slot].momentary;
		hold(
			slot,
			{
				tone: "muted",
				text: momentary
					? openText(view.durationMs)
					: ACTION_COPY[action].progress,
			},
			view.durationMs,
			momentary ? openText : undefined
		);
	}

	async function actuate(slot: LockSlot, action: DoorAction) {
		if (canLock(slot)) doors.reset(slot);
		holds.get(slot)?.();
		awaiting.delete(slot);
		attempts[slot].stop();
		setStatus(slot, { tone: "muted", text: SENDING_TEXT });
		try {
			const presence = await fetchPresenceToken();
			if (presence === null) {
				warn(slot, offsiteText(action));
				return;
			}
			const run = action === "unlock" ? unlock : lock;
			const result = await run.mutateAsync({ lock: slot, presence });
			if (result.status !== "ok") {
				hold(
					slot,
					{
						tone:
							result.status === "debounced" ? "muted" : "warning",
						text: resultText(
							result.status,
							slotInfo(slot).label,
							action
						),
					},
					STATUS_HOLD_MS
				);
				return;
			}
			if (result.attemptId === null) {
				sentUnfollowed(slot, action);
				return;
			}
			if (disposed) return;
			setStatus(slot, { tone: "muted", text: WAKING_TEXT });
			awaiting.set(slot, action);
			attempts[slot].watch(result.attemptId);
		} catch (err) {
			hold(
				slot,
				{
					tone: "error",
					text: userErrorMessage(
						err,
						ACTION_COPY[action].errorFallback
					),
				},
				STATUS_HOLD_MS
			);
		}
	}

	/** Shown while the person's door access is granted; hidden while
	 *  loading. */
	function canSeeDoors(): boolean {
		const me = person.data();
		return me ? doorOpensFor(me, Date.now()) : false;
	}

	function slotView(slot: LockSlot): SlotView {
		const status = statuses().get(slot);
		if (status) return { kind: "text", status };
		if (!canLock(slot)) return { kind: "button", action: "unlock" };
		const reading = doors.position(slot);
		switch (reading) {
			case undefined:
				return {
					kind: "text",
					status: { tone: "muted", text: CHECKING_TEXT },
				};
			case "locked":
				return { kind: "button", action: "unlock" };
			case "unlocked":
				return { kind: "button", action: "lock" };
			case "unlocking":
			case "locking": {
				const action = reading === "unlocking" ? "unlock" : "lock";
				return {
					kind: "text",
					status: {
						tone: "muted",
						text: ACTION_COPY[action].progress,
					},
				};
			}
			case "offline":
				return {
					kind: "text",
					status: {
						tone: "warning",
						text: offlineText(slotInfo(slot).label),
					},
				};
			case "unknown":
				return { kind: "both" };
		}
	}

	function refreshPositions() {
		for (const slot of LOCKABLE_SLOTS)
			if (!statuses().has(slot)) doors.recheck(slot);
	}

	function door(slot: LockSlot): JSX.Element {
		return (
			<DoorSlot
				slot={slot}
				view={() => slotView(slot)}
				onPress={(action) => void actuate(slot, action)}
			/>
		);
	}

	return (
		<Show when={canSeeDoors()}>
			<SpaceCard
				title="Doors"
				subtitle="An internet connection is required."
				headerAction={
					<IconButton
						tooltipLabel="Check again"
						isLoading={LOCKABLE_SLOTS.some((slot) =>
							doors.isChecking(slot)
						)}
						disabled={LOCKABLE_SLOTS.every((slot) =>
							statuses().has(slot)
						)}
						disabledReason="A door action is in progress…"
						onClick={refreshPositions}
					>
						{ICONS.refresh}
					</IconButton>
				}
			>
				<div class={styles.doors}>
					{door("upstairs")}
					<Route />
					{door("downstairs")}
				</div>
			</SpaceCard>
		</Show>
	);
}

/** One door's slot: its status text, its one big full-width button, or its
 *  name over Unlock and Lock side by side. When the slot swaps content and
 *  it held keyboard focus (or focus fell to the page when its button went
 *  away), focus lands on its first button again. */
function DoorSlot(props: {
	slot: LockSlot;
	view: () => SlotView;
	onPress: (action: DoorAction) => void;
}): JSX.Element {
	let slotEl: HTMLDivElement | undefined;
	let ownsFocus = false;
	const kind = createMemo(() => props.view().kind);
	function button(): Extract<SlotView, { kind: "button" }> | undefined {
		const view = props.view();
		return view.kind === "button" ? view : undefined;
	}
	function status(): DoorStatus | undefined {
		const view = props.view();
		return view.kind === "text" ? view.status : undefined;
	}
	createComputed(
		on(
			kind,
			() => {
				const active = document.activeElement;
				const idle = !active || active === document.body;
				ownsFocus =
					(!!active && !!slotEl?.contains(active)) ||
					(ownsFocus && idle);
			},
			{ defer: true }
		)
	);
	createEffect(
		on(
			kind,
			(current) => {
				if (current === "text" || !ownsFocus) return;
				const active = document.activeElement;
				if (active && active !== document.body) return;
				slotEl?.querySelector("button")?.focus();
				ownsFocus = false;
			},
			{ defer: true }
		)
	);
	function info() {
		return slotInfo(props.slot);
	}
	return (
		<div
			class={styles.slot}
			ref={(el) => {
				slotEl = el;
			}}
		>
			<Switch>
				<Match when={status()}>
					{(current) => (
						<p
							class={styles.slotText}
							classList={{
								[styles.statusWarning]:
									current().tone === "warning",
								[styles.statusError]:
									current().tone === "error",
							}}
							role={
								current().tone === "error" ? "alert" : "status"
							}
						>
							{current().text}
						</p>
					)}
				</Match>
				<Match when={button()}>
					{(current) => (
						<Button
							class={styles.door}
							onClick={() => {
								props.onPress(current().action);
							}}
						>
							<Icon>{ACTION_COPY[current().action].icon}</Icon>
							{`${ACTION_COPY[current().action].label} ${info().buttonLabel}`}
						</Button>
					)}
				</Match>
				<Match when={kind() === "both"}>
					<p class={styles.slotHeading}>{info().buttonLabel}</p>
					<div class={styles.both}>
						<For each={DOOR_ACTIONS}>
							{(each) => (
								<Button
									class={styles.door}
									aria-label={`${ACTION_COPY[each].label} ${info().buttonLabel}`}
									onClick={() => {
										props.onPress(each);
									}}
								>
									<Icon>{ACTION_COPY[each].icon}</Icon>
									{ACTION_COPY[each].label}
								</Button>
							)}
						</For>
					</div>
				</Match>
			</Switch>
		</div>
	);
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
