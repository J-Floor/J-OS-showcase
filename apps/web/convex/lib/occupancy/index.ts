import type { OccupancyProvider } from "./provider.ts";

/** Maximum people the space holds — the denominator of the occupancy gauge. */
export const CAPACITY = 40;

/**
 * The live occupancy source, or `null` to disable occupancy everywhere. The
 * door-open count adapter under `providers/` is not a headcount, so none
 * is active; a new source is one adapter file plus this line.
 */
export const ACTIVE_PROVIDER: OccupancyProvider | null = null;
