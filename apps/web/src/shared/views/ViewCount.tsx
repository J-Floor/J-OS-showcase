import { Icon, Tooltip } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import {
	NO_VIEWS,
	totalViews,
	type RoleCounts,
} from "../../../convex/lib/appViews.ts";
import { Can } from "../../lib/ability.tsx";
import { useQuery } from "../data/useQuery.ts";
import { ICONS } from "../icons.ts";

import styles from "./ViewCount.module.scss";

export function viewTooltip(counts: RoleCounts): string {
	return `Views today: ${counts.members} members · ${counts.board} board · ${counts.guests} guests`;
}

function Count(props: { viewKey: string }): JSX.Element {
	const today = useQuery(api.appViews.today, () => ({ key: props.viewKey }));
	function counts(): RoleCounts {
		return today.data() ?? NO_VIEWS;
	}
	return (
		<Tooltip.Anchor label={viewTooltip(counts())} triggerTabIndex={0}>
			<span
				role="img"
				aria-label={viewTooltip(counts())}
				class={styles.count}
			>
				<Icon>{ICONS.views}</Icon>
				<span>{totalViews(counts())}</span>
			</span>
		</Tooltip.Anchor>
	);
}

/** Today's unique viewers of one entity, for the board: an eye and the
 *  total, split by role on hover. The query is board-only (it throws for
 *  anyone else), so `Can` keeps it from ever being subscribed for them. */
export function ViewCount(props: { viewKey: string }): JSX.Element {
	return (
		<Can I="view" the="Analytics">
			<Count viewKey={props.viewKey} />
		</Can>
	);
}
