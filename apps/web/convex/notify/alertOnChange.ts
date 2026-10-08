import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { AlertDecision } from "../opsAlerts.ts";

import { notifyNow } from "./notify.ts";
import type { KindName, PayloadOf } from "./registry.ts";

/**
 * Tell the board about an ops fault only when `opsAlerts.claim` says so, and
 * undo the claim when the message reached nobody, so the next run retries. A
 * failed all-clear is NOT retried: its fingerprint is already "", so the next
 * run reads `silent`. Accepted loss: the fault alert already told the board.
 */
export async function alertOnChange<K extends KindName>(
	ctx: ActionCtx,
	alert: {
		key: string;
		fingerprint: string;
		kind: K;
		payloadFor: (
			decision: Exclude<AlertDecision, "silent">
		) => PayloadOf<K>;
	}
): Promise<AlertDecision> {
	const { key, fingerprint, kind, payloadFor } = alert;
	const decision = await ctx.runMutation(internal.opsAlerts.claim, {
		key,
		fingerprint,
	});
	if (decision === "silent") return decision;
	async function releaseClaim() {
		if (decision === "resolved") return;
		await ctx.runMutation(internal.opsAlerts.release, { key, fingerprint });
	}
	let result;
	try {
		result = await notifyNow(ctx, kind, payloadFor(decision));
	} catch (err) {
		await releaseClaim();
		throw err;
	}
	if (result.delivered === 0 && result.failed > 0) await releaseClaim();
	return decision;
}
