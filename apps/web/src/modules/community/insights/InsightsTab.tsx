import { Chart } from "@j-os/design-system";
import { For, Show, createMemo, type JSX } from "solid-js";

import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import {
	useApplications,
	useGuests,
	useMembers,
} from "../data/communityData.tsx";

import styles from "./InsightsTab.module.scss";
import {
	applicationsPerMonth,
	expiryRunway,
	headlines,
	hostLoad,
	joinsPerMonth,
	verticalMix,
	type PersonRow,
} from "./metrics.ts";
import { MetricTile } from "./MetricTile.tsx";

/**
 * The board's read-only view of the community as a whole.
 *
 * Every other tab answers "what about this person"; nothing answered "what
 * about all of them", so questions like how many guest windows close next month
 * or who is carrying the hosting were only answerable by exporting a CSV.
 *
 * It subscribes to nothing new. `CommunityDataProvider` already holds the three
 * rosters plus the board-level list for the whole session, so the tab is one derivation pass
 * over data that is on the client either way — which is also why it stays
 * correct as the board edits rows in the other tabs.
 */
export function InsightsTab(): JSX.Element {
	const applications = useApplications();
	const members = useMembers();
	const guests = useGuests();
	const boardLevel = useBoardLevel();

	function memberRows(): PersonRow[] {
		return members.data() ?? [];
	}
	function guestRows(): PersonRow[] {
		return guests.data() ?? [];
	}
	function applicationRows(): PersonRow[] {
		return applications.data() ?? [];
	}
	function everyone(): PersonRow[] {
		return [...memberRows(), ...guestRows(), ...applicationRows()];
	}

	/**
	 * One clock for the whole dashboard.
	 *
	 * Read once per derivation rather than per metric so the tiles and the
	 * charts cannot disagree: with `Date.now()` inline, "expiring in 14 days"
	 * and the runway chart would each pick their own midnight, and a window
	 * closing at the boundary could appear in one and not the other.
	 */
	const now = createMemo(() => {
		// Depend on the rosters so the clock advances whenever the data does.
		void members.data();
		void guests.data();
		void applications.data();
		return Date.now();
	});

	const tiles = createMemo(() =>
		headlines(memberRows(), guestRows(), applicationRows(), now())
	);
	const inbound = createMemo(() => applicationsPerMonth(everyone(), now()));
	const joins = createMemo(() =>
		joinsPerMonth(memberRows(), guestRows(), now())
	);
	const runway = createMemo(() => expiryRunway(guestRows(), now()));
	const hosts = createMemo(() =>
		hostLoad(guestRows(), boardLevel.data() ?? [])
	);
	const verticals = createMemo(() =>
		verticalMix([...memberRows(), ...guestRows()])
	);

	return (
		<div class={styles.tab}>
			<section class={styles.tiles}>
				<For each={tiles()}>
					{(tile) => (
						<MetricTile
							label={tile.label}
							value={tile.value}
							detail={tile.detail}
							tone={tile.tone}
						/>
					)}
				</For>
			</section>

			<section class={styles.charts}>
				<figure class={styles.card}>
					<figcaption class={styles.cardTitle}>
						Guest windows closing
						<span class={styles.cardHint}>
							Next twelve weeks. A spike is a week where several
							people lose the door at once.
						</span>
					</figcaption>
					<Chart
						data={runway()}
						xKey="week"
						series={[
							{ key: "expiring", label: "Guests", kind: "bar" },
						]}
						label="Guest windows closing over the next twelve weeks"
						emptyMessage="No guest windows are set to close."
					/>
				</figure>

				<figure class={styles.card}>
					<figcaption class={styles.cardTitle}>
						Applications received
						<span class={styles.cardHint}>
							By month submitted, counting everyone who applied —
							including the ones since approved.
						</span>
					</figcaption>
					<Chart
						data={inbound()}
						xKey="month"
						series={[
							{
								key: "applications",
								label: "Applications",
								kind: "bar",
							},
						]}
						label="Applications received per month"
					/>
				</figure>

				<figure class={styles.card}>
					<figcaption class={styles.cardTitle}>
						Access granted
						<span class={styles.cardHint}>
							When the people here now first got in. Departures
							are not in this — it is arrivals, not net growth.
						</span>
					</figcaption>
					<Chart
						data={joins()}
						xKey="month"
						series={[
							{
								key: "members",
								label: "Members",
								kind: "bar",
								stack: "joins",
							},
							{
								key: "guests",
								label: "Guests",
								kind: "bar",
								stack: "joins",
							},
						]}
						label="People granted access per month, members and guests"
					/>
				</figure>

				<figure class={styles.card}>
					<figcaption class={styles.cardTitle}>
						Who is hosting
						<span class={styles.cardHint}>
							Guests vouched for, per board member. Hosting is the
							one obligation the board takes on personally.
						</span>
					</figcaption>
					<Chart
						data={hosts()}
						xKey="host"
						series={[
							{ key: "guests", label: "Guests", kind: "bar" },
						]}
						label="Guests per host"
						emptyMessage="No guests are hosted yet."
					/>
				</figure>

				<Show when={verticals().length > 0}>
					<figure class={styles.card}>
						<figcaption class={styles.cardTitle}>
							What the floor is building
							<span class={styles.cardHint}>
								People count once per vertical they picked, so
								the total is larger than the head count.
							</span>
						</figcaption>
						<Chart
							data={verticals()}
							xKey="vertical"
							series={[
								{ key: "people", label: "People", kind: "bar" },
							]}
							label="People per vertical"
						/>
					</figure>
				</Show>
			</section>
		</div>
	);
}
