import { Button, Dialog } from "@j-os/design-system";
import { For, Show, createEffect, createSignal } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { readLocal, writeLocal } from "../../lib/browserStorage.ts";
import { useQuery } from "../../shared/data/useQuery.ts";

import {
	APP_VERSION,
	CHANGELOG,
	type ChangeEntry,
	isNewer,
} from "./changelog.ts";
import { doorsIntroPending } from "./doorIntroState.ts";
import styles from "./WhatsNew.module.scss";

/** Per-device record of the last version whose notes were acknowledged. Notes
 *  are informational, so a per-browser flag is right — no schema, no round-trip.
 *  Guarded because storage can be denied (private mode, blocked cookies). */
const STORAGE_KEY = "jos:whatsNewSeen";

function readSeen(): string | null {
	return readLocal(STORAGE_KEY).unwrapOr(null);
}

function writeSeen(version: string): void {
	// Storage denied: the dialog just shows again next load, harmless.
	writeLocal(STORAGE_KEY, version).unwrapOr(undefined);
}

/**
 * "What's new" on a version bump. Shown the first load AFTER a new version ships,
 * carrying the notes newer than what this browser last acknowledged.
 *
 * Deliberately NOT shown to a brand-new user: their first-ever load is the
 * {@link WelcomeTour}'s moment, and a changelog on top of it would be two
 * onboarding surfaces at once. It is suppressed only when the tour will actually
 * run — a member/guest with an `onboarding` record and `tourSeen` still false.
 * Board and admin have no `onboarding` record, so they always see it (they are
 * its audience); a first-timer's version is recorded silently so their first
 * genuine upgrade is what triggers this.
 *
 * It also waits for the one-time doors intro ({@link doorsIntroPending}): that
 * page is the first thing a person sees, and What's New decides only after it
 * has been dismissed.
 */
export function WhatsNew() {
	const state = useQuery(api.onboarding.getState, {});
	const [open, setOpen] = createSignal(false);
	const [fresh, setFresh] = createSignal<ChangeEntry[]>([]);

	// Decide once, when the onboarding state first resolves. `handled` guards
	// against the query pushing later updates (a re-render must not re-open a
	// dialog the user just dismissed).
	let isHandled = false;
	createEffect(() => {
		if (isHandled) return;
		const data = state.data();
		// While the doors intro is pending, do nothing — and do NOT mark this
		// handled — so the effect runs again when the intro is dismissed (the
		// query pushes the person with `doorsIntroSeenAt` set) and decides then.
		if (!data || doorsIntroPending(data.person, Date.now())) return;
		isHandled = true;

		const seen = readSeen();
		if (seen === APP_VERSION) return;

		// Suppress ONLY when the welcome tour will actually run — a member/guest
		// still onboarding — so the two onboarding surfaces never stack. Gate on
		// "the tour will run", NOT on `tourSeen` being truthy: board and admin
		// have no `onboarding` record at all, so a `!tourSeen` check misread them
		// as brand-new and hid What's New from its own audience. Record the
		// version so a first-timer does not get the whole changelog on return.
		const onboarding = data.person?.onboarding;
		const isTourWillRun = onboarding !== undefined && !onboarding.tourSeen;
		if (isTourWillRun) {
			writeSeen(APP_VERSION);
			return;
		}

		const entries = CHANGELOG.filter((entry) =>
			isNewer(entry.version, seen)
		);
		if (entries.length === 0) {
			writeSeen(APP_VERSION);
			return;
		}
		setFresh(entries);
		setOpen(true);
	});

	function dismiss(): void {
		writeSeen(APP_VERSION);
		setOpen(false);
	}

	return (
		<Dialog.Root
			open={open()}
			onOpenChange={(details) => {
				if (!details.open) dismiss();
			}}
		>
			<Dialog.Content>
				<Dialog.Title>What's new</Dialog.Title>
				<Show when={open()}>
					<div class={styles.body}>
						<For each={fresh()}>
							{(entry) => (
								<section class={styles.entry}>
									<h3 class={styles.entryTitle}>
										{entry.title}
									</h3>
									<ul class={styles.items}>
										<For each={entry.items}>
											{(item) => <li>{item}</li>}
										</For>
									</ul>
								</section>
							)}
						</For>
					</div>
					<div class={styles.footer}>
						<Dialog.CloseTrigger
							asChild={(closeProps) => (
								<Button {...(closeProps() as object)}>
									Got it
								</Button>
							)}
						/>
					</div>
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
