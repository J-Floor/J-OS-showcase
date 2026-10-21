import type { ResultAsync } from "neverthrow";

import type { DoorError } from "../errors/door.ts";

/** A source of the current headcount. `null` = no reading available. */
export type OccupancyProvider = {
	count(now: number): ResultAsync<number | null, DoorError>;
};
