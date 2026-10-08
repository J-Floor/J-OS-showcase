import { ConvexError } from "convex/values";

/**
 * The text safe to show a user for a thrown Convex action error. Convex
 * redacts a plain `Error`'s message in production — only `ConvexError.data`
 * survives to the client — so anything else (a plain `Error`, a rejected
 * non-Error value, a `ConvexError` whose data isn't a string) falls back to
 * `fallback` rather than leaking or misrendering internals.
 */
export function userErrorMessage(err: unknown, fallback: string): string {
	return err instanceof ConvexError && typeof err.data === "string"
		? err.data
		: fallback;
}
