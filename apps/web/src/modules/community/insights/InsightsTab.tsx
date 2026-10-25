import { Chart, type ChartDatum, type ChartProps } from "@j-os/design-system";
import { For, Show, createMemo, type JSX } from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import {
	useApplications,
	useGuests,
	useMembers,
} from "../data/communityData.tsx";

import { AttendanceSection } from "./AttendanceSection.tsx";
import { ChartCard } from "./ChartCard.tsx";
import styles from "./InsightsTab.module.scss";
import {
	applicationsPerMonth,
	expiryRunway,
	headlines,
	hostLoad,
	joinsPerMonth,
	verticalMix,
} from "./metrics.ts";
import { MetricTile } from "./MetricTile.tsx";

/** Every figure the dashboard shows, derived from the three rosters. */
function useInsightMetrics() {
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
		// These bare reads are the memo's dependencies, not dead code: the clock
		// advances whenever a roster's data does.
		members.data();
		guests.data();
		applications.data();
		return Date.now();
	});

	function rostersLoading(): boolean {
		return (
			members.data() === undefined ||
			guests.data() === undefined ||
			applications.data() === undefined
		);
	}
	function hostsLoading(): boolean {
		return guests.data() === undefined || boardLevel.data() === undefined;
	}

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

	return {
		tiles,
		inbound,
		joins,
		runway,
		hosts,
		verticals,
		rostersLoading,
		hostsLoading,
	};
}

type InsightMetrics = ReturnType<typeof useInsightMetrics>;

/** What each chart card shows. The cards differ only in copy and series, so
 *  they are rows here rather than five components. */
const CHART_CARDS: {
	title: string;
	hint: string;
	/** Replaces the chart's default message when there is nothing to plot. */
	emptyCopy?: string;
	chart: Pick<ChartProps, "xKey" | "series" | "label">;
	data: (metrics: InsightMetrics) => ChartDatum[];
	loading: (metrics: InsightMetrics) => boolean;
}[] = [
	{
		title: "Guest windows closing",
		hint: "Next twelve weeks. A spike is a week where several people lose the door at once.",
		emptyCopy: "No guest windows are set to close.",
		chart: {
			xKey: "week",
			series: [{ key: "expiring", label: "Guests", kind: "bar" }],
			label: "Guest windows closing over the next twelve weeks",
		},
		data: (metrics) => metrics.runway(),
		loading: (metrics) => metrics.rostersLoading(),
	},
	{
		title: "Applications received",
		hint: "By month submitted, counting everyone who applied — including the ones since approved.",
		chart: {
			xKey: "month",
			series: [
				{ key: "applications", label: "Applications", kind: "bar" },
			],
			label: "Applications received per month",
		},
		data: (metrics) => metrics.inbound(),
		loading: (metrics) => metrics.rostersLoading(),
	},
	{
		title: "Access granted",
		hint: "When the people here now first got in. Departures are not in this — it is arrivals, not net growth.",
		chart: {
			xKey: "month",
			series: [
				{
					key: "members",
					label: "Members",
					kind: "bar",
					stack: "joins",
				},
				{ key: "guests", label: "Guests", kind: "bar", stack: "joins" },
			],
			label: "People granted access per month, members and guests",
		},
		data: (metrics) => metrics.joins(),
		loading: (metrics) => metrics.rostersLoading(),
	},
	{
		title: "Who is hosting",
		hint: "Guests vouched for, per board member. Hosting is the one obligation the board takes on personally.",
		emptyCopy: "No guests are hosted yet.",
		chart: {
			xKey: "host",
			series: [{ key: "guests", label: "Guests", kind: "bar" }],
			label: "Guests per host",
		},
		data: (metrics) => metrics.hosts(),
		loading: (metrics) => metrics.hostsLoading(),
	},
	{
		title: "What the floor is building",
		hint: "People count once per vertical they picked, so the total is larger than the head count.",
		emptyCopy: "No one has picked a vertical yet.",
		chart: {
			xKey: "vertical",
			series: [{ key: "people", label: "People", kind: "bar" }],
			label: "People per vertical",
		},
		data: (metrics) => metrics.verticals(),
		loading: (metrics) => metrics.rostersLoading(),
	},
];

function InsightCharts(props: { metrics: InsightMetrics }): JSX.Element {
	return (
		<section class={styles.charts}>
			<For each={CHART_CARDS}>
				{(card) => (
					<ChartCard
						title={card.title}
						hint={card.hint}
						loading={card.loading(props.metrics)}
					>
						<Chart {...card.chart} data={card.data(props.metrics)}>
							<Show when={card.emptyCopy}>
								{(copy) => <Chart.Empty>{copy()}</Chart.Empty>}
							</Show>
						</Chart>
					</ChartCard>
				)}
			</For>
		</section>
	);
}

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
	const metrics = useInsightMetrics();

	return (
		<div class={styles.tab}>
			<section class={styles.tiles}>
				<For each={metrics.tiles()}>
					{(tile) => (
						<MetricTile
							label={tile.label}
							value={tile.value}
							loading={metrics.rostersLoading()}
							detail={tile.detail}
							tone={tile.tone}
						/>
					)}
				</For>
			</section>

			<InsightCharts metrics={metrics} />

			<AttendanceSection />
		</div>
	);
}
