import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { useQuery } from "../../shared/data/useQuery.ts";

import { daysLeft } from "./countdown.ts";
import styles from "./CountdownCard.module.scss";
import { SpaceCard } from "./SpaceCard.tsx";

/**
 * Live-tab card, guests only: days left on the access window. Permanent
 * members/board have no `accessUntil`, so the card renders nothing for them.
 * While the person is loading it shows as a loading card.
 */
export function CountdownCard() {
	const person = useQuery(api.people.getCurrentPerson, {});
	function until() {
		return person.data()?.accessUntil;
	}
	return (
		<Show when={person.data() === undefined || until() !== undefined}>
			<SpaceCard
				title="Access"
				helpText="Days left on your access."
				loading={person.data() === undefined}
			>
				<Show when={until()}>
					{(accessUntil) => (
						<div class={styles.count}>
							<span class={styles.num}>
								{daysLeft(accessUntil(), Date.now())}
							</span>
							<span class={styles.label}>days left</span>
						</div>
					)}
				</Show>
			</SpaceCard>
		</Show>
	);
}
