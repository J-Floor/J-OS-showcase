import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";

/** Why a typed "seconds on screen" cannot be saved, or `null` when it can: a
 *  whole number from the server's minimum to its maximum. */
export function durationProblem(text: string): string | null {
	const range = `${TV_LIMITS.durationMin} to ${TV_LIMITS.durationMax}`;
	if (text.trim() === "") return `Enter the seconds, ${range}.`;
	const value = Number(text);
	const isInRange =
		Number.isInteger(value) &&
		value >= TV_LIMITS.durationMin &&
		value <= TV_LIMITS.durationMax;
	return isInRange ? null : `Use a whole number of seconds, ${range}.`;
}
