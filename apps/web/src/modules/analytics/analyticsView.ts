import {
	rangeFromValue,
	WEB_ANALYTICS_RANGES,
	type RankedRow,
	type WebAnalyticsRange,
} from "../../../convex/lib/webAnalytics.ts";
import { formatAgo } from "../../shared/time.ts";

// What both Analytics tabs share: the range switch and its `?range` param,
// the "refreshed" line, and breakdown shares.

export const RANGES = WEB_ANALYTICS_RANGES.map((days) => ({
	days,
	label: `${String(days)}d`,
}));

const DEFAULT_RANGE: WebAnalyticsRange = 30;

export function rangeFromParameter(
	raw: string | string[] | undefined
): WebAnalyticsRange {
	return rangeFromValue(raw) ?? DEFAULT_RANGE;
}

export function refreshedLabel(
	fetchedAt: number | undefined,
	now: number
): string {
	return fetchedAt === undefined
		? "Not refreshed yet"
		: `Refreshed ${formatAgo(fetchedAt, now)}`;
}

export function withShare<Row extends RankedRow>(
	rows: Row[],
	total: number
): (Row & { share: number })[] {
	return rows.map((row) => ({
		...row,
		share: total === 0 ? 0 : row.count / total,
	}));
}
