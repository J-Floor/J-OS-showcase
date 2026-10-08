import { DatePicker } from "@j-os/design-system";
import { type JSX, createSignal } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import {
	composeExpiry,
	guestChosenIso,
	minExpiryIso,
	SITE_TIMEZONE,
} from "../../../../convex/lib/time.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { useTriage } from "../actions/triage.ts";

import styles from "./AccessUntilControl.module.scss";

/** Can this person's window be moved from where they stand? */
export function canExtendWindow(person: Doc<"people">): boolean {
	// No assertion: `tier` and `stage` are the schema's own unions, so the
	// template literal is already `StateId`.
	return legalEvents(`${person.tier}.${person.stage}`).includes(
		"EXTEND_WINDOW"
	);
}

/**
 * A guest's access end date, editable.
 *
 * Dispatched as the machine's `EXTEND_WINDOW`, never as a field write. The date
 * is not just data: moving it reschedules the expiry job, and moving it forward
 * on an expired guest puts them back into `guest.active` (or back into
 * onboarding, if they never finished it). Patching `accessUntil` directly would
 * change the number and none of that — which is exactly the bypass the machine
 * exists to close.
 *
 * Confirmed like the door override, and for the same reason: this is who can
 * physically get into the building, and shortening a window locks someone out
 * on a date they were not expecting.
 */
export function AccessUntilControl(props: {
	personId: Doc<"people">["_id"];
	/** Current end of their window, epoch ms. */
	value: number;
	/** The live person doc's `accessUntilLocal`, if present. */
	accessUntilLocal?: string;
	name: string;
}): JSX.Element {
	const { extendWindow } = useTriage();
	const confirm = useConfirm();
	const [saving, setSaving] = createSignal(false);

	function change(iso: string | null): void {
		const until = composeExpiry(iso, SITE_TIMEZONE)?.utc ?? null;
		// Clearing is not an extend. The machine has no "open-ended guest", and
		// ending access early is `KICK_OUT` / `MARK_LEFT` — both of which live
		// in the role dialog, where they say what they do.
		if (until === null || until === props.value || saving()) return;
		const shorter = until < props.value;
		void (async () => {
			setSaving(true);
			try {
				if (
					await confirm({
						title: `Move ${props.name}'s access to ${iso}?`,
						message: shorter
							? "Their key stops working on the new date, which is earlier than the one they have now."
							: "Their key keeps working until the new date. If their access had already run out, this puts them back in.",
						confirmLabel: shorter
							? "Shorten access"
							: "Extend access",
						tone: shorter ? "danger" : "default",
					})
				)
					await extendWindow(props.personId, until);
			} finally {
				setSaving(false);
			}
		})();
	}

	return (
		<DatePicker
			// Controlled by the server value: if the board cancels the dialog
			// or the mutation fails, the field snaps back to the window they
			// actually have rather than showing a date nobody agreed to.
			value={guestChosenIso(
				props.accessUntilLocal,
				props.value,
				SITE_TIMEZONE
			)}
			minIso={minExpiryIso(SITE_TIMEZONE)}
			onValueChange={change}
			class={styles.picker}
		/>
	);
}
