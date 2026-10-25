import { Button, Dialog, Icon } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import { useMutation } from "convex-solidjs";
import { For, createSignal, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { ignoreFailure } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { LOCK_SLOTS } from "../space/lockSlots.ts";

import { doorsIntroPending } from "./doorIntroState.ts";
import styles from "./DoorsIntro.module.scss";

/** What each door is, spelled out for someone seeing this for the first
 *  time — the one bit of copy that does not fit naturally in `LOCK_SLOTS`,
 *  which every OTHER door surface also renders. */
const DOOR_DESCRIPTIONS: Record<LockSlot, string> = {
	downstairs: "the street door.",
	upstairs: "the J floor door.",
};

/**
 * "Getting in": the one-time page that tells a person how the doors work now —
 * the app opens them, from the Doors card on the Space page, over the
 * internet. Shown on app open to everyone whose door
 * access is granted and who has not dismissed it (`people.doorsIntroSeenAt`),
 * before the welcome tour and What's New, which both wait for it.
 *
 * Only the two buttons mark it seen. They close it locally at once, and the
 * query then pushes the person with `doorsIntroSeenAt` set, which is what
 * releases the tour and What's New. Escape or a tap outside closes it for this
 * session only, so an accidental dismissal does not lose it for good.
 */
export function DoorsIntro(): JSX.Element {
	const state = useQuery(api.onboarding.getState, {});
	const setSeen = useMutation(api.onboarding.setDoorsIntroSeen);
	const navigate = useNavigate();
	const [dismissed, setDismissed] = createSignal(false);

	function pending(): boolean {
		return doorsIntroPending(state.data()?.person, Date.now());
	}

	function open(): boolean {
		return pending() && !dismissed();
	}

	/** A button press: close now and record it as seen. A failed save only
	 *  means it shows again next session, and the dialog is already closed, so
	 *  there is no area left to show it in. */
	function markSeen(): void {
		if (dismissed()) return;
		setDismissed(true);
		ignoreFailure(setSeen.mutateAsync({}));
	}

	function goToDoors(): void {
		markSeen();
		navigate("/space?tab=access");
	}

	return (
		<Dialog.Root
			open={open()}
			onOpenChange={(isOpen) => {
				// Escape / outside tap: close for this session, record nothing.
				if (!isOpen) setDismissed(true);
			}}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Getting in</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<ul class={styles.doors}>
						<For each={LOCK_SLOTS}>
							{(door) => (
								<li class={styles.door}>
									<Icon>{door.icon}</Icon>
									<span>
										<strong class={styles.doorName}>
											{door.buttonLabel}
										</strong>{" "}
										— {DOOR_DESCRIPTIONS[door.slot]}
									</span>
								</li>
							)}
						</For>
					</ul>
					<p class={styles.how}>
						Open them from the <strong>Doors</strong> card on the
						Space page. You need an internet connection.
					</p>
				</Dialog.Body>
				<Dialog.Footer>
					<Button variant="tertiary" onClick={goToDoors}>
						Go to Doors
					</Button>
					<Button onClick={markSeen}>Got it</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
