import { ConvexError } from "convex/values";
import { ResultAsync } from "neverthrow";

import type { ConvexErrorData } from "../../convex/lib/result.ts";

/** A failure the client can show: a server refusal's {@link ConvexErrorData},
 *  or one the client made itself (`Unknown`, `Timeout`, ...), so `code`
 *  widens to any string. */
export type ClientError = Omit<ConvexErrorData, "code"> & { code: string };

function isErrorData(data: unknown): data is ClientError {
	return (
		typeof data === "object" &&
		data !== null &&
		"code" in data &&
		"message" in data &&
		typeof data.code === "string" &&
		typeof data.message === "string"
	);
}

/**
 * Fire a Convex call whose failure has nobody to tell (an audit ping, a
 * remembered page). The rejection is dropped here, once.
 */
export function ignoreFailure(promise: Promise<unknown>): void {
	promise.catch(() => null);
}

/**
 * Run a Convex mutation or action call as a Result. Only a ConvexError's data
 * survives to the client in production; anything else becomes `fallback`, so
 * internals never reach the UI.
 */
export function call<T>(
	promise: Promise<T>,
	fallback: string
): ResultAsync<T, ClientError> {
	return ResultAsync.fromPromise(promise, (error) =>
		error instanceof ConvexError && isErrorData(error.data)
			? error.data
			: { code: "Unknown", message: fallback }
	);
}
