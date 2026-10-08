import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";

import type { KindName, PayloadOf } from "./registry.ts";
import type { DispatchResult } from "./types.ts";

/**
 * Send a notification from a mutation. Schedules dispatch with `runAfter(0)`,
 * so the caller stays fast and the send only happens if its transaction
 * commits. The payload is type-checked against the kind.
 */
export async function notify<K extends KindName>(
	ctx: MutationCtx,
	kind: K,
	payload: PayloadOf<K>
): Promise<void> {
	await ctx.scheduler.runAfter(0, internal.notify.dispatch.run, {
		kind,
		payload,
	});
}

/**
 * Send a notification from an action and wait for the result. Used by the
 * door alerts, which give their `opsAlerts` claim back when nothing went out.
 */
export async function notifyNow<K extends KindName>(
	ctx: ActionCtx,
	kind: K,
	payload: PayloadOf<K>
): Promise<DispatchResult> {
	return ctx.runAction(internal.notify.dispatch.run, { kind, payload });
}
