import { ConvexError } from "convex/values";
import type { Result } from "neverthrow";

import { type AppError, messageFor } from "./errors/index.ts";

// The only module allowed to throw (lint enforces it). Results stop at the
// handler edge because only a throw rolls a Convex mutation back.

/** What a refusal carries to the client, as `ConvexError.data`. */
export type ConvexErrorData = { code: AppError["type"]; message: string };

/** Handler edge: the value of an Ok, or a ConvexError the client can show. */
export function unwrap<T>(result: Result<T, AppError>): T {
	if (result.isErr()) refuse(result.error);
	return result.value;
}

/** Handler edge, for a refusal decided on the spot: a ConvexError carrying
 *  the error's code and its mapped message. */
export function refuse(error: AppError): never {
	throw new ConvexError<ConvexErrorData>({
		code: error.type,
		message: messageFor(error),
	});
}

/** {@link refuse} for a refusal whose fields (the table that ran over
 *  budget, the violated rules, the refused transition) are for the operator,
 *  not the client: they go to the Convex logs under `label`, the client gets
 *  the area's generic message. */
export function refuseLogged(error: AppError, label: string): never {
	const { type, ...detail } = error;
	if (Object.keys(detail).length > 0)
		// eslint-disable-next-line no-console -- the operator reads a refusal's detail in the Convex logs
		console.warn(`${label} refused (${type}): ${JSON.stringify(detail)}`);
	return refuse(error);
}

/** {@link unwrap}, logging the refusal's fields as {@link refuseLogged} does. */
export function unwrapLogged<T>(result: Result<T, AppError>, label: string): T {
	if (result.isErr()) refuseLogged(result.error, label);
	return result.value;
}

/** A bug, not a user error: Convex redacts the message for the client. */
export function invariant(
	condition: unknown,
	message: string
): asserts condition {
	if (!condition) throw new Error(message);
}
