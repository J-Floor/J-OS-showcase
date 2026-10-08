/** A source of the current headcount. `null` = no reading available. */
export type OccupancyProvider = {
	count(now: number): Promise<number | null>;
};
