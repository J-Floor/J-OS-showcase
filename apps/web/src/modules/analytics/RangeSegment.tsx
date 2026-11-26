import { Segment } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import {
	rangeFromValue,
	type WebAnalyticsRange,
} from "../../../convex/lib/webAnalytics.ts";

import { RANGES } from "./analyticsView.ts";

/** The 7 / 30 / 90 day switch both Analytics tabs share. */
export function RangeSegment(props: {
	range: WebAnalyticsRange;
	onRangeChange: (range: WebAnalyticsRange) => void;
}): JSX.Element {
	return (
		<Segment.Root
			label="Range"
			orientation="horizontal"
			value={String(props.range)}
			onValueChange={(details) => {
				const next = rangeFromValue(details.value);
				if (next) props.onRangeChange(next);
			}}
		>
			<For each={RANGES}>
				{(range) => (
					<Segment.Item value={String(range.days)}>
						{range.label}
					</Segment.Item>
				)}
			</For>
		</Segment.Root>
	);
}
