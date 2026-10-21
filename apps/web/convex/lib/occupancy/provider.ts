// Provider-agnostic occupancy model: pure types plus a test seam. A counter
// from a new vendor is a new implementation of OccupancyProvider, not a change
// here.
import type { Result, ResultAsync } from "neverthrow";

import type { OccupancyError } from "../errors/occupancy.ts";

import type { OccupancyUpdate } from "./update.ts";

/**
 * An anonymous people counter. It knows how many are inside, never who.
 * A provider implements the side its hardware offers, or both.
 */
export type OccupancyProvider = {
	/** The longest gap between two reports that is normal for this counter.
	 *  Past it the counter counts as offline: time stops accruing and the
	 *  board is alerted. Absent for a push counter that sends no heartbeat,
	 *  whose silence is normal. */
	readonly maxSilenceMs?: number;
	/** Poll hardware: the current headcount. One read, never retried. */
	readCount?(): ResultAsync<number, OccupancyError>;
	/** Push hardware: the updates in one webhook delivery, in order. */
	parseWebhook?(
		body: string,
		headers: Headers
	): Result<OccupancyUpdate[], OccupancyError>;
};

/**
 * Test seam, for the same reason as `setDoorProviderForTests`: a provider
 * object is not a Convex value, so tests set it here instead of passing it
 * through an action's args. Production leaves it undefined. Reset it to
 * `undefined` in an `afterEach`.
 */
let injectedProvider: OccupancyProvider | undefined;

export function setOccupancyProviderForTests(
	provider: OccupancyProvider | undefined
): void {
	injectedProvider = provider;
}

export function injectedOccupancyProvider(): OccupancyProvider | undefined {
	return injectedProvider;
}
