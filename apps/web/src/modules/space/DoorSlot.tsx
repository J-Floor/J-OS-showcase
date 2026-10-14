import { Button, Icon, Skeleton } from "@j-os/design-system";
import {
	For,
	Match,
	Switch,
	createComputed,
	createEffect,
	createMemo,
	on,
	type JSX,
} from "solid-js";

import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { type DoorAction } from "../../../convex/lib/doorProvider.ts";

import { ACTION_COPY, DOOR_ACTIONS } from "./doorCopy.ts";
import { type DoorStatus, type SlotView } from "./doorView.ts";
import { slotInfo } from "./lockSlots.ts";
import styles from "./UnlockCard.module.scss";

/** When the slot swaps content and it held keyboard focus (or focus fell to
 *  the page when its button went away), focus lands on its first button
 *  again. Returns the ref callback for the slot's element. */
function createSlotFocusKeeper(props: {
	view: () => SlotView;
}): (element: HTMLDivElement) => void {
	const kind = createMemo(() => props.view().kind);
	let slotElement: HTMLDivElement | undefined;
	let isOwnsFocus = false;
	createComputed(
		on(
			kind,
			() => {
				const active = document.activeElement;
				const isIdle = !active || active === document.body;
				isOwnsFocus =
					(!!active && !!slotElement?.contains(active)) ||
					(isOwnsFocus && isIdle);
			},
			{ defer: true }
		)
	);
	createEffect(
		on(
			kind,
			(current) => {
				if (current === "text" || current === "pending" || !isOwnsFocus)
					return;
				const active = document.activeElement;
				if (active && active !== document.body) return;
				slotElement?.querySelector("button")?.focus();
				isOwnsFocus = false;
			},
			{ defer: true }
		)
	);
	return (element) => {
		slotElement = element;
	};
}

/** A door whose bolt has not been read on this mount yet: a button-shaped
 *  skeleton. */
function PendingSlot(): JSX.Element {
	return (
		<div
			class={styles.pending}
			role="status"
			aria-label="Loading"
			data-door-skeleton=""
		>
			<Skeleton class={styles.doorSkeleton} />
		</div>
	);
}

/** One door's slot: its status text, its one big full-width button, or its
 *  name over Unlock and Lock side by side. */
export function DoorSlot(props: {
	slot: LockSlot;
	view: () => SlotView;
	onPress: (action: DoorAction) => void;
}): JSX.Element {
	const slotReference = createSlotFocusKeeper(props);
	const kind = createMemo(() => props.view().kind);
	function button(): Extract<SlotView, { kind: "button" }> | undefined {
		const view = props.view();
		return view.kind === "button" ? view : undefined;
	}
	function status(): DoorStatus | undefined {
		const view = props.view();
		return view.kind === "text" ? view.status : undefined;
	}
	function info() {
		return slotInfo(props.slot);
	}
	return (
		<div class={styles.slot} ref={slotReference}>
			<Switch>
				<Match when={kind() === "pending"}>
					<PendingSlot />
				</Match>
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
