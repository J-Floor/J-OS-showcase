import { useAction } from "convex-solidjs";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { OccupancyAnswer } from "../../../convex/occupancy.ts";

import { occupancyFill, occupancyLevel } from "./occupancy.ts";
import styles from "./OccupancyCard.module.scss";
import { OccupancyGauge } from "./OccupancyGauge.tsx";
import { SpaceCard } from "./SpaceCard.tsx";

export const POLL_INTERVAL_MS = 60_000;

/**
 * Live-tab card: an ambient occupancy gauge, refreshed every 60s. Renders
 * nothing while occupancy is disabled (no active provider).
 */
export function OccupancyCard() {
	const occ = useAction(api.occupancy.current);
	// Last successful answer; a failed call keeps it, so the card stays as it was.
	const [answer, setAnswer] = createSignal<OccupancyAnswer | null>(null);
	function enabled() {
		return answer()?.enabled === true;
	}
	// `null` = no reading (the active provider returned no reading) → "Unknown".
	function fill() {
		const a = answer();
		return a?.enabled && a.count !== null
			? occupancyFill(a.count, a.capacity)
			: null;
	}

	let id: ReturnType<typeof setInterval> | undefined;
	let disposed = false;

	function stopPolling() {
		clearInterval(id);
		id = undefined;
	}

	function ensurePolling() {
		if (id === undefined && !disposed) {
			id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
		}
	}

	// Ticks overlap and responses can resolve out of order; only the newest
	// request may update state or the polling interval.
	let latestSeq = 0;

	async function refresh() {
		const seq = ++latestSeq;
		try {
			const r = await occ.mutate({});
			if (seq !== latestSeq) return;
			setAnswer(r);
			// Only an explicit "disabled" answer stops polling.
			if (r.enabled) ensurePolling();
			else stopPolling();
		} catch {
			if (seq !== latestSeq) return;
			// ambient readout — keep the last answer, never throw
			ensurePolling(); // a failed call is not "disabled": retry next tick
		}
	}

	onMount(() => {
		onCleanup(() => {
			disposed = true;
			stopPolling();
		});
		void refresh();
	});

	return (
		<Show when={enabled()}>
			<SpaceCard
				title="Occupancy"
				helpText="How full the space is right now."
			>
				<div class={styles.readout}>
					<OccupancyGauge fill={fill() ?? 0} />
					<span class={styles.level}>{occupancyLevel(fill())}</span>
				</div>
			</SpaceCard>
		</Show>
	);
}
