import { internalAction } from "../_generated/server";
import type { LockStatus } from "../lib/doorProvider.ts";
import {
	doorProvider,
	doorProviderConfigured,
} from "../lib/doorProviderEnv.ts";
import { DOOR_ONLINE_ALERT_KEY } from "../opsAlerts.ts";

import { alertOnChange } from "./alertOnChange.ts";

function offlineAlert(offline: LockStatus[]) {
	const names = offline.map((lock) => lock.name).join(", ");
	return {
		headline: `${names} offline.`,
		detail:
			offline.length === 1
				? "The lock has dropped off the door provider, so the app cannot open it."
				: "These locks have dropped off the door provider, so the app cannot open them.",
		consequence:
			"Check the lock's power and its Wi-Fi bridge. You will be told when it is back.",
		tag: DOOR_ONLINE_ALERT_KEY,
	};
}

const BACK_ONLINE = {
	headline: "Every door lock is back online.",
	detail: "All configured locks are reachable again.",
	consequence: "Nothing to do.",
	tag: DOOR_ONLINE_ALERT_KEY,
};

/**
 * One door-provider list call every 10 minutes. `opsAlerts.claim` with the sorted
 * offline lock ids as fingerprint decides: `changed` → name the locks that
 * are offline now; `renag` → the same reminder after a week unfixed;
 * `resolved` → all clear; `silent` → nothing. An alert that reached nobody
 * releases the claim, so the next poll retries it. A first run with every
 * lock online records silence, so a fresh deployment does not announce health.
 */
export const poll = internalAction({
	args: {},
	handler: async (ctx): Promise<null> => {
		if (!doorProviderConfigured()) {
			// eslint-disable-next-line no-console -- door provider not configured on this deployment: surface the skipped poll in the Convex logs
			console.log("[door-poll] door provider is not configured; skipped");
			return null;
		}
		const locks = await doorProvider({
			requireWrites: false,
		}).readLockStatus();
		const offline = locks
			.filter((lock) => !lock.online)
			.sort((a, b) => a.lockId.localeCompare(b.lockId));
		await alertOnChange(ctx, {
			key: DOOR_ONLINE_ALERT_KEY,
			fingerprint: offline.map((lock) => lock.lockId).join(","),
			kind: "doorAlert",
			payloadFor: (decision) =>
				decision === "resolved" ? BACK_ONLINE : offlineAlert(offline),
		});
		return null;
	},
});
