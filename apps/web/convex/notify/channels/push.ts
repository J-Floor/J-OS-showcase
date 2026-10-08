"use node";
import { v } from "convex/values";

import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import type { PushSendResult } from "../types.ts";

import {
	injectedPushSender,
	isGone,
	type PushSender,
	vapidFromEnv,
} from "./pushSender.ts";

const ONE_DAY_SECONDS = 24 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

/**
 * The real sender. `web-push` is imported lazily, after the VAPID check, so a
 * deployment (or a convex-test run) without keys never loads the Node package.
 */
async function webPushSender(): Promise<PushSender> {
	const mod = await import("web-push");
	const webpush = mod.default;
	return async (subscription, body, vapid) => {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth },
			},
			body,
			{
				TTL: ONE_DAY_SECONDS,
				timeout: PUSH_TIMEOUT_MS,
				vapidDetails: {
					subject: vapid.subject,
					publicKey: vapid.publicKey,
					privateKey: vapid.privateKey,
				},
			}
		);
	};
}

/**
 * Push one message to every subscription of one recipient, all devices at
 * once. Each subscription is isolated: one dead or slow device never blocks the
 * others. 404/410 deletes the
 * subscription (the browser dropped it); anything else is logged and counted.
 */
export const send = internalAction({
	args: {
		subscriptions: v.array(
			v.object({
				endpoint: v.string(),
				p256dh: v.string(),
				auth: v.string(),
			})
		),
		message: v.object({
			title: v.string(),
			body: v.string(),
			url: v.string(),
			tag: v.string(),
		}),
	},
	handler: async (
		ctx,
		{ subscriptions, message }
	): Promise<PushSendResult> => {
		const vapid = vapidFromEnv();
		if (!vapid) {
			// eslint-disable-next-line no-console -- no VAPID keys on this deployment (dev): surface the skipped push in the Convex logs
			console.log(
				`[push] VAPID keys are not set; skipped "${message.title}"`
			);
			return { delivered: 0, failed: 0 };
		}
		const sender = injectedPushSender() ?? (await webPushSender());
		const body = JSON.stringify(message);
		const outcomes = await Promise.allSettled(
			subscriptions.map((subscription) =>
				sender(subscription, body, vapid)
			)
		);
		let delivered = 0;
		let failed = 0;
		for (const [index, outcome] of outcomes.entries()) {
			if (outcome.status === "fulfilled") {
				delivered += 1;
				continue;
			}
			const err: unknown = outcome.reason;
			if (isGone(err)) {
				await ctx.runMutation(
					internal.notify.subscriptions.removeByEndpoint,
					{ endpoint: subscriptions[index].endpoint }
				);
				continue;
			}
			failed += 1;
			// eslint-disable-next-line no-console -- surface push delivery failures in the Convex logs
			console.error(`[push] send failed for "${message.title}"`, err);
		}
		return { delivered, failed };
	},
});
