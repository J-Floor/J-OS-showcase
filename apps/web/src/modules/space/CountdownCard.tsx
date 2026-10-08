import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";

import { daysLeft } from "./countdown.ts";
import styles from "./CountdownCard.module.scss";
import { SpaceCard } from "./SpaceCard.tsx";

/**
 * Live-tab card, guests only: days left on the access window. Permanent
 * members/board have no `accessUntil`, so the card renders nothing for them.
 */
export function CountdownCard() {
	const person = useQuery(api.people.getCurrentPerson, {});
	function until() {
		return person.data()?.accessUntil;
	}
	return (
		<Show when={until() != null}>
			<SpaceCard title="Access" helpText="Days left on your access.">
				<div class={styles.count}>
					<span class={styles.num}>
						{daysLeft(until()!, Date.now())}
					</span>
					<span class={styles.label}>days left</span>
				</div>
			</SpaceCard>
		</Show>
	);
}
