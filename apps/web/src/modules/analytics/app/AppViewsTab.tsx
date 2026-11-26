import { Chart } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { Show, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import {
	totalViews,
	type LabelledView,
	type ShownViewSummary,
} from "../../../../convex/lib/appViews.ts";
import type { WebAnalyticsRange } from "../../../../convex/lib/webAnalytics.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ChartCard } from "../../../shared/insights/ChartCard.tsx";
import { MetricTile } from "../../../shared/insights/MetricTile.tsx";
import { rangeFromParameter, refreshedLabel } from "../analyticsView.ts";
import { BreakdownCard, type BreakdownRow } from "../BreakdownCard.tsx";
import { RangeSegment } from "../RangeSegment.tsx";

import styles from "./AppViewsTab.module.scss";
import { entityHref, pageHref } from "./appViewsView.ts";

function sumCounts(rows: LabelledView[]): number {
	return rows.reduce((sum, row) => sum + row.count, 0);
}

function rowsOf(
	rows: LabelledView[],
	hrefOf: (key: string) => string | undefined
): BreakdownRow[] {
	return rows.map((row) => ({
		label: row.label,
		count: row.count,
		href: hrefOf(row.key),
	}));
}

function Breakdowns(props: { summary?: ShownViewSummary }): JSX.Element {
	return (
		<div class={styles.breakdowns}>
			<BreakdownCard
				title="Top pages"
				rows={rowsOf(props.summary?.pages ?? [], pageHref)}
				total={sumCounts(props.summary?.pages ?? [])}
			/>
			<BreakdownCard
				title="Top entries"
				rows={rowsOf(props.summary?.entities ?? [], entityHref)}
				total={sumCounts(props.summary?.entities ?? [])}
			/>
		</div>
	);
}

function Tiles(props: { summary?: ShownViewSummary }): JSX.Element {
	function isLoading(): boolean {
		return props.summary === undefined;
	}
	return (
		<div class={styles.tiles}>
			<MetricTile
				label="Views"
				value={props.summary && totalViews(props.summary.totals)}
				loading={isLoading()}
			/>
			<MetricTile
				label="Members"
				value={props.summary?.totals.members}
				loading={isLoading()}
			/>
			<MetricTile
				label="Board"
				value={props.summary?.totals.board}
				loading={isLoading()}
			/>
			<MetricTile
				label="Guests"
				value={props.summary?.totals.guests}
				loading={isLoading()}
			/>
		</div>
	);
}

/**
 * The board's view of how the app is used: unique views per day by role, and
 * the pages and items opened most. The range comes from `?range`, shared with
 * the Website tab.
 */
export function AppViewsTab(): JSX.Element {
	const [params, setParams] = useSearchParams();
	function range(): WebAnalyticsRange {
		return rangeFromParameter(params.range);
	}
	const view = useQuery(api.appViews.summary, () => ({ days: range() }));
	// `days` tells this range's answer from the previous range's, which the
	// query keeps serving while its arguments change.
	function current() {
		const data = view.data();
		return data?.days === range() ? data : undefined;
	}
	function summary(): ShownViewSummary | undefined {
		return current()?.summary;
	}
	function builtAt(): number | null | undefined {
		return current()?.builtAt;
	}
	return (
		<div class={styles.page}>
			<div>
				<RangeSegment
					range={range()}
					onRangeChange={(days) => {
						setParams({ range: String(days) });
					}}
				/>
			</div>
			<Tiles summary={summary()} />
			<ChartCard
				title="Daily unique views"
				hint="One view per person, page or item and day (Zurich time)."
				loading={summary() === undefined}
			>
				<Chart
					label="Daily unique views by role"
					xKey="date"
					data={summary()?.daily ?? []}
					series={[
						{
							key: "members",
							label: "Members",
							kind: "bar",
							stack: "views",
						},
						{
							key: "board",
							label: "Board",
							kind: "bar",
							stack: "views",
						},
						{
							key: "guests",
							label: "Guests",
							kind: "bar",
							stack: "views",
						},
					]}
				/>
			</ChartCard>
			<Breakdowns summary={summary()} />
			<Show when={builtAt()}>
				{(at) => (
					<p class={styles.updated}>
						Counts before today. {refreshedLabel(at(), Date.now())}
					</p>
				)}
			</Show>
		</div>
	);
}
