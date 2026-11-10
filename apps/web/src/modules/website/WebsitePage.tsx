import { Chart, EmptyState, Status } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import {
	createEffect,
	createSignal,
	For,
	on,
	onCleanup,
	Show,
	type JSX,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import {
	refreshOpensAt,
	type BreakdownKey,
	type RankedRow,
	type WebAnalyticsRange,
	type WebAnalyticsSummary,
} from "../../../convex/lib/webAnalytics.ts";
import { call } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { ICONS } from "../../shared/icons.ts";
import { ChartCard } from "../../shared/insights/ChartCard.tsx";
import { MetricTile } from "../../shared/insights/MetricTile.tsx";

import { BreakdownCard } from "./BreakdownCard.tsx";
import { RefreshBar } from "./RefreshBar.tsx";
import styles from "./WebsitePage.module.scss";
import {
	countryName,
	failureNotice,
	isStale,
	rangeFromParameter,
	refreshedLabel,
	sampleNotice,
	topLabel,
	viewsPerVisit,
} from "./websiteView.ts";

const CLOCK_TICK_MS = 60_000;

const BREAKDOWNS: readonly { key: BreakdownKey; title: string }[] = [
	{ key: "pages", title: "Pages" },
	{ key: "referrers", title: "Referrers" },
	{ key: "countries", title: "Countries" },
	{ key: "devices", title: "Devices" },
	{ key: "browsers", title: "Browsers" },
	{ key: "os", title: "OS" },
];

/** A clock that ticks every minute, for the "Refreshed X ago" label, and
 *  that `tick` moves on at once. */
function createMinuteClock() {
	const [now, setNow] = createSignal(Date.now());
	function tick() {
		setNow(Date.now());
	}
	const timer = setInterval(tick, CLOCK_TICK_MS);
	onCleanup(() => {
		clearInterval(timer);
	});
	return { now, tick };
}

/** The refresh action for the current range, with the failure it can leave. */
function createRefresher(
	range: () => WebAnalyticsRange,
	onSettled: () => void
) {
	const action = useAction(api.websiteAnalytics.refresh);
	const [refreshing, setRefreshing] = createSignal(false);
	const [failure, setFailure] = createSignal<string>();

	async function refresh() {
		setRefreshing(true);
		setFailure(undefined);
		const days = range();
		const result = await call(
			action.mutateAsync({ days }),
			"Couldn't refresh."
		);
		if (result.isErr() && range() === days)
			setFailure(result.error.message);
		setRefreshing(false);
		onSettled();
	}
	// A failure belongs to the range it happened on.
	createEffect(
		on(
			range,
			() => {
				setFailure(undefined);
			},
			{ defer: true }
		)
	);
	return { refreshing, failure, refresh };
}

/**
 * Asks for a refresh once per range selection, when its snapshot loads
 * missing or stale. Not while the query still shows the previous range's
 * answer, and never when the provider is not connected.
 */
function createAutoRefresh(
	view: ReturnType<typeof useQuery<typeof api.websiteAnalytics.snapshot>>,
	range: () => WebAnalyticsRange,
	refresh: () => Promise<void>
) {
	let autoRefreshedFor: WebAnalyticsRange | undefined;
	createEffect(() => {
		const data = view.data();
		// `days` tells this range's answer from the previous range's, which the
		// query keeps serving while its arguments change.
		if (
			data?.days !== range() ||
			!data.configured ||
			autoRefreshedFor === range()
		)
			return;
		autoRefreshedFor = range();
		if (isStale(data.snapshot?.fetchedAt, Date.now())) void refresh();
	});
}

/** A name in a figure tile: its own type, one line, the full name on hover. */
function CountryValue(props: { name: string }): JSX.Element {
	return (
		<span class={styles.textValue} title={props.name}>
			{props.name}
		</span>
	);
}

function Tiles(props: { summary?: WebAnalyticsSummary }): JSX.Element {
	function isLoading(): boolean {
		return props.summary === undefined;
	}
	return (
		<div class={styles.tiles}>
			<MetricTile
				label="Views"
				value={props.summary?.totals.views}
				loading={isLoading()}
			/>
			<MetricTile
				label="Visits"
				value={props.summary?.totals.visits}
				loading={isLoading()}
			/>
			<MetricTile
				label="Views per visit"
				value={props.summary && viewsPerVisit(props.summary.totals)}
				loading={isLoading()}
			/>
			<MetricTile
				label="Top country"
				value={
					props.summary && (
						<CountryValue
							name={countryName(
								topLabel(props.summary.countries)
							)}
						/>
					)
				}
				loading={isLoading()}
			/>
		</div>
	);
}

function rowsFor(
	summary: WebAnalyticsSummary | undefined,
	key: BreakdownKey
): RankedRow[] {
	const rows = summary?.[key] ?? [];
	return key === "countries"
		? rows.map((row) => ({ ...row, label: countryName(row.label) }))
		: rows;
}

function Traffic(props: { summary?: WebAnalyticsSummary }): JSX.Element {
	return (
		<>
			<ChartCard
				title="Daily traffic"
				hint="Page views and visits per day (UTC)."
				loading={props.summary === undefined}
			>
				<Chart
					label="Daily views and visits"
					xKey="date"
					data={props.summary?.daily ?? []}
					series={[
						{ key: "views", label: "Views", kind: "area" },
						{ key: "visits", label: "Visits", kind: "line" },
					]}
				/>
			</ChartCard>
			<div class={styles.breakdowns}>
				<For each={BREAKDOWNS}>
					{(breakdown) => (
						<BreakdownCard
							title={breakdown.title}
							rows={rowsFor(props.summary, breakdown.key)}
							total={props.summary?.totals.views ?? 0}
						/>
					)}
				</For>
			</div>
		</>
	);
}

/**
 * The board's view of the public site's traffic. Reads the shared cached
 * snapshot for the chosen range, and asks the server to refresh it when it is
 * missing or older than 15 minutes, or when someone presses refresh. The
 * server guards each range to one fetch a minute.
 */
export function WebsitePage(): JSX.Element {
	const [params, setParams] = useSearchParams();
	function range(): WebAnalyticsRange {
		return rangeFromParameter(params.range);
	}
	const view = useQuery(api.websiteAnalytics.snapshot, () => ({
		days: range(),
	}));
	const { now, tick } = createMinuteClock();
	const { refreshing, failure, refresh } = createRefresher(range, tick);
	createAutoRefresh(view, range, refresh);

	function snapshot() {
		return view.data()?.snapshot ?? null;
	}
	function opensAt(): number {
		return refreshOpensAt(snapshot());
	}

	// The refresh button comes back the moment the server's guard lifts, not at
	// the next minute tick.
	createEffect(() => {
		const wait = opensAt() - Date.now();
		if (wait <= 0) return;
		const timer = setTimeout(tick, wait);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});

	return (
		<div class={styles.page}>
			<Show
				when={view.data()?.configured !== false}
				fallback={
					<EmptyState
						icon={ICONS.website}
						title="Website analytics not connected"
						description="Ask an admin to connect the analytics provider."
					/>
				}
			>
				<RefreshBar
					range={range()}
					onRangeChange={(days) => {
						setParams({ range: String(days) });
					}}
					refreshedLabel={refreshedLabel(
						snapshot()?.fetchedAt,
						now()
					)}
					refreshing={refreshing()}
					canRefresh={now() >= opensAt()}
					onRefresh={() => {
						void refresh();
					}}
				/>
				<Show when={failureNotice(snapshot(), now())}>
					{(notice) => <Status status="warning">{notice()}</Status>}
				</Show>
				<Show when={failure()}>
					{(message) => <Status status="error">{message()}</Status>}
				</Show>
				<Show when={sampleNotice(snapshot()?.summary?.sampleInterval)}>
					{(notice) => <Status status="info">{notice()}</Status>}
				</Show>
				<Tiles summary={snapshot()?.summary} />
				<Traffic summary={snapshot()?.summary} />
			</Show>
		</div>
	);
}
