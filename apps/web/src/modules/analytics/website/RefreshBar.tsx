import { IconButton } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { WebAnalyticsRange } from "../../../../convex/lib/webAnalytics.ts";
import { ICONS } from "../../../shared/icons.ts";
import { RangeSegment } from "../RangeSegment.tsx";

import styles from "./WebsiteTab.module.scss";

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
			<RangeSegment
				range={props.range}
				onRangeChange={props.onRangeChange}
			/>
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
