import { IconButton, Segment } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import {
	rangeFromValue,
	type WebAnalyticsRange,
} from "../../../convex/lib/webAnalytics.ts";
import { ICONS } from "../../shared/icons.ts";

import styles from "./WebsitePage.module.scss";
import { RANGES } from "./websiteView.ts";

/** Range switch on the left; how old the data is and the refresh button on
 *  the right. */
export function RefreshBar(props: {
	range: WebAnalyticsRange;
	onRangeChange: (range: WebAnalyticsRange) => void;
	refreshedLabel: string;
	refreshing: boolean;
	canRefresh: boolean;
	onRefresh: () => void;
}): JSX.Element {
	return (
		<div class={styles.bar}>
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
			<div class={styles.freshness}>
				<span class={styles.refreshed}>{props.refreshedLabel}</span>
				<IconButton
					tooltipLabel="Refresh"
					isLoading={props.refreshing}
					disabled={!props.canRefresh}
					disabledReason="Refreshed a moment ago"
					onClick={() => {
						props.onRefresh();
					}}
				>
					{ICONS.refresh}
				</IconButton>
			</div>
		</div>
	);
}
