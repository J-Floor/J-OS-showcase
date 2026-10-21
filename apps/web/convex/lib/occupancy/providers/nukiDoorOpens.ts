import { okAsync, ResultAsync } from "neverthrow";

import type { DoorError } from "../../errors/door.ts";
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
	return entries.filter((entry) => isDoorOpened(entry)).length;
}

/** Sum door-open events across all locks since `sinceIso`. */
function countDoorOpensSince(
	deps: NukiDeps,
	args: { lockIds: string[]; sinceIso: string }
): ResultAsync<number, DoorError> {
	return args.lockIds.reduce<ResultAsync<number, DoorError>>(
		(total, lockId) =>
			total.andThen((sum) =>
				fetchSmartlockLog(deps, {
					lockId,
					sinceIso: args.sinceIso,
				}).map((log) => sum + countDoorOpens(log))
			),
		okAsync(0)
	);
}

export function startOfTodayIso(now: number): string {
	const zoned = zonedFromEpoch(now, SITE_TIMEZONE);
	const today = `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`;
	return new Date(
		composeZoned(today, "00:00", SITE_TIMEZONE).utc
	).toISOString();
}

/** Occupancy from today's door-sensor opens. A proxy, not a headcount; `null`
 *  when Nuki env is unset. */
export const nukiDoorOpensProvider: OccupancyProvider = {
	count(now) {
		const token = process.env.NUKI_API_TOKEN;
		const lockIds = parseLockIds(process.env.NUKI_SMARTLOCK_IDS);
		return !token || lockIds.length === 0
			? okAsync(null)
			: countDoorOpensSince(
					{ fetch, token },
					{ lockIds, sinceIso: startOfTodayIso(now) }
				);
	},
};
