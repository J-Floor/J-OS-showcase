import {
	Chart,
	Segment,
	Skeleton,
	type ChartSeries,
} from "@j-os/design-system";
import { Show, createMemo, createSignal, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { pad } from "../../../../convex/lib/time.ts";
import type {
	AttendanceAnswer,
	AttendanceDay,
} from "../../../../convex/occupancy.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";

import {
	ACTIVE_DAY_MIN_PEOPLE,
	activeDaysThisMonth,
	attendanceRows,
	busiestThisMonth,
	usualPeakHour,
	type AttendanceRange,
} from "./attendance.ts";
import styles from "./AttendanceSection.module.scss";
import { ChartCard } from "./ChartCard.tsx";
import insights from "./InsightsTab.module.scss";
import { MetricTile } from "./MetricTile.tsx";

const PERCENT = 100;

const ENTRIES_HINT =
	"The number of different people falls between the two: everyone walks in at least once, and the most-at-once were all there together. One person going out for lunch walks in twice.";
const COUNT_ONLY_HINT = "The most people in the space at the same time.";
const MONTHLY_HINT = " Monthly bars are the average per open day.";

type EnabledAnswer = Extract<AttendanceAnswer, { enabled: true }>;

function clockHour(hour: number): string {
	return `${pad(hour)}:00`;
}

function busiestValue(busiest: number | null, capacity: number): string {
	return busiest === null ? "—" : `${String(busiest)} of ${String(capacity)}`;
}

function busiestDetail(busiest: number | null, capacity: number): string {
	return busiest === null
		? "Nobody in yet this month."
		: `${String(Math.round((busiest / capacity) * PERCENT))}% of capacity`;
}

/** `value()` once the answer is in, a skeleton until then. */
function whenLoaded(
	answer: EnabledAnswer | undefined,
	value: (answer: EnabledAnswer) => JSX.Element
): JSX.Element {
	return answer ? value(answer) : <Skeleton width="short" />;
}

function Tiles(props: {
	answer: EnabledAnswer | undefined;
	now: number;
}): JSX.Element {
	const busiest = createMemo(() =>
		props.answer ? busiestThisMonth(props.answer.days, props.now) : null
	);
	const usualHour = createMemo(() =>
		props.answer ? usualPeakHour(props.answer.days, props.now) : null
	);

	return (
		<section class={insights.tiles}>
			<MetricTile
				label="Busiest day this month"
				value={whenLoaded(props.answer, (answer) =>
					busiestValue(busiest(), answer.capacity)
				)}
				detail={
					props.answer
						? busiestDetail(busiest(), props.answer.capacity)
						: undefined
				}
			/>
			<Show when={props.answer === undefined || usualHour() !== null}>
				<MetricTile
					label="Usually busiest at"
					value={whenLoaded(props.answer, () =>
						clockHour(usualHour() ?? 0)
					)}
					detail="Typical time of the day's peak, last 30 days."
				/>
			</Show>
			<MetricTile
				label="Active days this month"
				value={whenLoaded(props.answer, (answer) =>
					activeDaysThisMonth(answer.days, props.now)
				)}
				detail={`Days with at least ${String(ACTIVE_DAY_MIN_PEOPLE)} people in at once.`}
			/>
		</section>
	);
}

/** The two attendance charts for the chosen range, as skeletons until the
 *  days are in. */
function AttendanceCharts(props: {
	days: AttendanceDay[] | undefined;
	range: AttendanceRange;
	now: number;
}): JSX.Element {
	const chart = createMemo(() =>
		attendanceRows(props.days ?? [], props.range, props.now)
	);
	function peopleHint(): string {
		return (
			(chart().hasEntries ? ENTRIES_HINT : COUNT_ONLY_HINT) +
			(props.range === "months" ? MONTHLY_HINT : "")
		);
	}
	function peopleSeries(): ChartSeries[] {
		const mostAtOnce: ChartSeries = {
			key: "mostAtOnce",
			label: "Most at once",
			kind: "bar",
		};
		const walkIns: ChartSeries = {
			key: "walkIns",
			label: "Walk-ins",
			kind: "line",
		};
		return chart().hasEntries ? [mostAtOnce, walkIns] : [mostAtOnce];
	}

	return (
		<section class={insights.charts}>
			<ChartCard
				title="People per day"
				hint={peopleHint()}
				loading={props.days === undefined}
			>
				<Chart
					data={chart().rows}
					xKey="label"
					series={peopleSeries()}
					label={
						chart().hasEntries
							? "People per day: most at once and walk-ins"
							: "People per day: most at once"
					}
				/>
			</ChartCard>
			<ChartCard
				title="Hours spent at J floor"
				hint="Every hour anyone spent in the space, added up."
				loading={props.days === undefined}
			>
				<Chart
					data={chart().rows}
					xKey="label"
					series={[{ key: "hours", label: "Hours", kind: "bar" }]}
					label="Hours spent at J floor"
				/>
			</ChartCard>
		</section>
	);
}

/**
 * Attendance on the Insights tab: how busy the space is, from the anonymous
 * people counter. Renders nothing while the counter is not installed or when
 * the read fails. The numbers are people in the space, never a head count of
 * individuals, and the copy says so.
 */
export function AttendanceSection(): JSX.Element {
	const attendance = useQuery(api.occupancy.attendance, {});
	const [range, setRange] = createSignal<AttendanceRange>("days");

	const answer = createMemo(() => {
		const current = attendance.data();
		return !attendance.error() && current?.enabled ? current : undefined;
	});
	function isLoading(): boolean {
		return attendance.data() === undefined && !attendance.error();
	}
	function isVisible(): boolean {
		return isLoading() || answer() !== undefined;
	}
	const now = createMemo(() => {
		attendance.data();
		return Date.now();
	});

	return (
		<Show when={isVisible()}>
			<section
				class={styles.section}
				aria-labelledby="attendance-heading"
			>
				<div class={styles.header}>
					<h2 id="attendance-heading" class={styles.heading}>
						Attendance
					</h2>
					<Segment.Root
						aria-label="Attendance range"
						value={range()}
						onValueChange={(details) => {
							if (
								details.value === "days" ||
								details.value === "months"
							)
								setRange(details.value);
						}}
					>
						<Segment.Item value="days">30 days</Segment.Item>
						<Segment.Item value="months">12 months</Segment.Item>
					</Segment.Root>
				</div>
				<Tiles answer={answer()} now={now()} />
				<AttendanceCharts
					days={answer()?.days}
					range={range()}
					now={now()}
				/>
			</section>
		</Show>
	);
}
