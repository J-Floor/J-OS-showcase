import { Skeleton } from "@j-os/design-system";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { useQuery } from "../../shared/data/useQuery.ts";

import { occupancyFill, occupancyLevel } from "./occupancy.ts";
import styles from "./OccupancyCard.module.scss";
import { OccupancyGauge } from "./OccupancyGauge.tsx";
import { SpaceCard } from "./SpaceCard.tsx";

/**
 * Live-tab card: an ambient occupancy gauge. Live through the query
 * subscription. Renders nothing while occupancy is disabled (no counter
 * installed) or when the read fails; a loading card until the first answer.
 */
export function OccupancyCard() {
	const occupancy = useQuery(api.occupancy.current, {});
	function enabled() {
		return !occupancy.error() && occupancy.data()?.enabled === true;
	}
	function loading() {
		return occupancy.data() === undefined && !occupancy.error();
	}
	// `null` = no reading yet → "Unknown".
	function fill() {
		const answer = occupancy.data();
		return answer?.enabled && answer.count !== null
			? occupancyFill(answer.count, answer.capacity)
			: null;
	}

	return (
		<Show when={loading() || enabled()}>
			<SpaceCard.Root loading={loading()}>
				<SpaceCard.Header title="Occupancy" />
				<SpaceCard.Help>
					How full the space is right now.
				</SpaceCard.Help>
				<SpaceCard.Body>
					<div class={styles.readout}>
						<OccupancyGauge fill={fill() ?? 0} />
						<span class={styles.level}>
							{occupancyLevel(fill())}
						</span>
					</div>
				</SpaceCard.Body>
				<SpaceCard.Skeleton>
					<Skeleton class={styles.gaugeSkeleton} />
				</SpaceCard.Skeleton>
			</SpaceCard.Root>
		</Show>
	);
}
