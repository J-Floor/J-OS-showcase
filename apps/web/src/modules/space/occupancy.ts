/** Occupancy as a [0,1] fill ratio for the gauge. Clamped and zero-safe. */
export function occupancyFill(count: number, capacity: number): number {
	if (capacity <= 0) return 0;
	return Math.min(1, Math.max(0, count / capacity));
}

/** A human label for the gauge so the icons read clearly. Thirds of the fill;
 * `null` fill (no reading available) reads as "Unknown". */
export function occupancyLevel(
	fill: number | null
): "Unknown" | "Low" | "Medium" | "High" {
	if (fill === null) return "Unknown";
	if (fill < 1 / 3) return "Low";
	if (fill < 2 / 3) return "Medium";
	return "High";
}
