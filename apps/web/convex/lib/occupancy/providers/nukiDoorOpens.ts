import {
	type NukiDeps,
	fetchSmartlockLog,
	parseLockIds,
} from "../../nukiClient.ts";
import {
	SITE_TIMEZONE,
	composeZoned,
	pad,
	zonedFromEpoch,
} from "../../time.ts";
import type { OccupancyProvider } from "../provider.ts";

/**
 * Nuki Web API smart-lock log `action` code for a door-sensor "door opened"
 * event. Unlock actions do NOT track entries — the door-sensor open event
 * does. This is the v1 occupancy signal; the seam in lib/occupancy/index.ts lets a future non-Nuki source replace it.
 * Confirm this code against the deployed locks via GET /smartlock/{id}/log
 * (developer.nuki.io) before relying on the live count.
 */
export const DOOR_OPENED_ACTION = 240;

export function isDoorOpened(entry: { action: number }): boolean {
	return entry.action === DOOR_OPENED_ACTION;
}

export function countDoorOpens(entries: { action: number }[]): number {
	return entries.filter(isDoorOpened).length;
}

/** Sum door-open events across all locks since `sinceIso`. */
async function countDoorOpensSince(
	deps: NukiDeps,
	args: { lockIds: string[]; sinceIso: string }
): Promise<number> {
	let total = 0;
	for (const lockId of args.lockIds) {
		const log = await fetchSmartlockLog(deps, {
			lockId,
			sinceIso: args.sinceIso,
		});
		total += countDoorOpens(log);
	}
	return total;
}

export function startOfTodayIso(now: number): string {
	const z = zonedFromEpoch(now, SITE_TIMEZONE);
	const today = `${z.year}-${pad(z.month)}-${pad(z.day)}`;
	return new Date(
		composeZoned(today, "00:00", SITE_TIMEZONE).utc
	).toISOString();
}

/** Occupancy from today's door-sensor opens. A proxy, not a headcount; `null`
 *  when Nuki env is unset. */
export const nukiDoorOpensProvider: OccupancyProvider = {
	async count(now) {
		const token = process.env.NUKI_API_TOKEN;
		const lockIds = parseLockIds(process.env.NUKI_SMARTLOCK_IDS);
		if (!token || lockIds.length === 0) return null;
		return countDoorOpensSince(
			{ fetch, token },
			{ lockIds, sinceIso: startOfTodayIso(now) }
		);
	},
};
