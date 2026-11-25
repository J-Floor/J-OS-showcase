import { fetchSchedule } from "./api.ts";
import { createBackoff } from "./backoff.ts";
import { parseSchedule, type Schedule } from "./schedule.ts";
import { storage } from "./storage.ts";

export type ScheduleSync = {
	/** Called each tick with the manifest's version; fetches only on change. Returns false on 401. */
	onManifest(
		version: number | null | undefined,
		token: string,
		stop: AbortSignal
	): Promise<boolean>;
};

/**
 * Keeps the device's power schedule in step with the manifest's
 * `scheduleVersion`. It fetches `/tv/schedule` only when that version differs
 * from the one applied, keeps the last good schedule on any failure (backing
 * off like the pack), and never throws: a schedule problem must not block the
 * slides. A schedule stored by an earlier run is reported at once, so a TV
 * that boots offline still follows it.
 */
export function createScheduleSync(options: {
	onSchedule: (schedule: Schedule | undefined) => void;
	now?: () => number;
}): ScheduleSync {
	const now = options.now ?? Date.now;
	/** undefined = nothing applied yet this run; null = the server has none. */
	let applied: number | null | undefined;
	const backoff = createBackoff({ now });

	/** The callback is the caller's: a throw from it must not break the sync. */
	function report(schedule: Schedule | undefined): void {
		try {
			options.onSchedule(schedule);
		} catch {
			// Ignored: the schedule is stored; the next change is reported again.
		}
	}

	const stored = storage.getSchedule();
	const initial = stored === null ? undefined : parseSchedule(stored);
	if (initial) report(initial);

	function clear(version: number | null): void {
		storage.clearSchedule();
		report(undefined);
		applied = version;
		backoff.clear();
	}

	async function fetchAndApply(
		version: number,
		token: string,
		stop: AbortSignal
	): Promise<boolean> {
		try {
			const result = await fetchSchedule(token, stop);
			if (result === "unauthorized") return false;
			if (stop.aborted) return true;
			if (result === "missing") {
				clear(version);
				return true;
			}
			const schedule = parseSchedule(result.xml);
			if (schedule === undefined) {
				backoff.recordFailure(version);
				return true;
			}
			storage.setSchedule(result.xml);
			report(schedule);
			applied = result.version ?? version;
			backoff.clear();
		} catch {
			if (!stop.aborted) backoff.recordFailure(version);
		}
		return true;
	}

	return {
		async onManifest(version, token, stop) {
			if (version === undefined) return true;
			if (version === null) {
				if (applied !== null) clear(null);
				return true;
			}
			const isCurrent =
				version === applied || backoff.isBackedOff(version);
			return isCurrent || fetchAndApply(version, token, stop);
		},
	};
}
