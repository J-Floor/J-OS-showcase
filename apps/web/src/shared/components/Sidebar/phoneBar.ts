/** The phone bar slots, the last one the more item when pages overflow. */
export const PHONE_BAR_SLOTS = 5;

/** The pages the bar shows and the ones that overflow, in priority order. */
export function splitPhoneBar<T>(pages: readonly T[]): {
	bar: T[];
	overflow: T[];
} {
	if (pages.length <= PHONE_BAR_SLOTS)
		return { bar: [...pages], overflow: [] };
	return {
		bar: pages.slice(0, PHONE_BAR_SLOTS - 1),
		overflow: pages.slice(PHONE_BAR_SLOTS - 1),
	};
}
