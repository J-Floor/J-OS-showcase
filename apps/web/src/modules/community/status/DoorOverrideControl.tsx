import { Segment } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { For, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DoorOverride } from "../../../../convex/lib/derive.ts";
import { useConfirm } from "../../../shared/confirm.tsx";

import styles from "./DoorOverrideControl.module.scss";

/**
 * The board's door override, editable.
 *
 * Not a switch, despite being asked for as one: the stored value has three
 * states, not two. "Automatic" means the lock follows the lifecycle — an active
 * member gets in, an expired guest does not, and it keeps tracking them as
 * their state changes. The two overrides pin the answer regardless. A two-way
 * switch would have to silently pick one of "automatic" or "always allow" as
 * its off position, and whichever it picked would be wrong half the time.
 *
 * Every change is confirmed, because both overrides are physical-access
 * decisions: one locks a paying member out of the building, the other lets
 * someone in whom the rules currently exclude.
 */
const OPTIONS: {
	value: DoorOverride;
	label: string;
	/** What this setting means. "Automatic" in particular says nothing on its
	 *  own — it is the absence of an override, which is not a thing a label can
	 *  convey. */
	hint: string;
	confirm: string;
}[] = [
	{
		value: "none",
		label: "Automatic",
		hint: "No override. The lock follows their membership: in while they are active, out once they are not.",
		confirm:
			"Their access will follow the normal rules again, and change as their membership does.",
	},
	{
		value: "force_on",
		label: "Always allow",
		hint: "Let them in whatever their membership says — including before it starts or after it ends. Never expires on its own.",
		confirm:
			"They will be let in even when the rules say otherwise — including after their membership ends. This does not expire on its own.",
	},
	{
		value: "force_off",
		label: "Block",
		hint: "Keep them out whatever their membership says. Their key stops working at the next reconcile.",
		confirm:
			"Their key stops working at the next reconcile, whatever their membership says.",
	},
];

export function DoorOverrideControl(props: {
	personId: Id<"people">;
	value: DoorOverride;
	name: string;
}): JSX.Element {
	const setOverride = useMutation(api.door.setOverride);
	const confirm = useConfirm();

	function change(next: DoorOverride): void {
		if (next === props.value) return;
		const option = OPTIONS.find((o) => o.value === next);
		if (!option) return;
		void (async () => {
			if (
				await confirm({
					title: `${option.label} door access for ${props.name}?`,
					message: option.confirm,
					confirmLabel: option.label,
					tone: next === "force_off" ? "danger" : "default",
				})
			)
				await setOverride.mutateAsync({
					personId: props.personId,
					override: next,
				});
		})();
	}

	function hint(): string {
		return OPTIONS.find((o) => o.value === props.value)?.hint ?? "";
	}

	return (
		<div class={styles.control}>
			<Segment.Root
				// Stacked, not scrolled: the drawer's value column is too narrow for
				// three options side by side, and a segmented control you have to
				// scroll hides the very choices it exists to show.
				orientation="vertical"
				class={styles.segment}
				// Controlled by the server value, never by local state: if the
				// mutation fails or the board cancels the dialog, the control must
				// snap back to what the door is actually doing rather than showing
				// a change that never happened.
				value={props.value}
				onValueChange={(details) => {
					change(details.value as DoorOverride);
				}}
			>
				<For each={OPTIONS}>
					{(option) => (
						<Segment.Item value={option.value}>
							{option.label}
						</Segment.Item>
					)}
				</For>
			</Segment.Root>
			{/* The explanation sits under the control rather than in a tooltip
			    on each option. Tooltips were tried and cannot work here: ark's
			    Tooltip has to wrap its trigger, and a wrapper between the group
			    and its items leaves zag measuring the sliding indicator at
			    zero — the selected option loses its highlight entirely. This
			    also beats a tooltip on its merits: "Automatic" is the option
			    that needs explaining, and hover-only help is help you have to
			    already suspect you need. */}
			<span class={styles.hint}>{hint()}</span>
		</div>
	);
}
