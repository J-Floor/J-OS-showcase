import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

import { prefFor } from "./categories.ts";
import { sendNotificationEmail } from "./channels/email.ts";
import { appPath } from "./inbox.ts";
import { kindDef, kindValidator } from "./registry.ts";
import type {
	DispatchResult,
	PushMessage,
	PushSendResult,
	ResolvedRecipient,
} from "./types.ts";

const CONCURRENCY = 8;

type Tally = { delivered: number; failed: number };

/** `message` is undefined when this recipient's push builder threw. */
type Outgoing = {
	recipient: ResolvedRecipient;
	message: PushMessage | undefined;
};

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array<R>(items.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker)
	);
	return results;
}

/**
 * Fan one notification out to its audience. Every recipient first gets a row
 * in their notification history (the push message, whatever their switches
 * say); a failed history write is logged and never stops delivery, so a door
 * alert still reaches the board. Then push and email go out per recipient,
 * gated by prefs. Failures are isolated per recipient and per channel: a push
 * failure never blocks the email, and one recipient never blocks the rest
 * (recipients run concurrently, a few at a time). The result counts push and
 * email deliveries and failures only, so an action caller (the door alerts)
 * can tell "nothing went out".
 */
export const run = internalAction({
	args: { kind: kindValidator, payload: v.any() },
	handler: async (ctx, args): Promise<DispatchResult> => {
		const { kind } = args;
		const payload: unknown = args.payload;
		const def = kindDef(kind);
		const recipients: ResolvedRecipient[] = await ctx.runQuery(
			internal.notify.recipients.resolve,
			{ kind, payload }
		);
		const outgoing: Outgoing[] = recipients.map((recipient) => {
			try {
				return { recipient, message: def.push(payload, recipient) };
			} catch (err) {
				// eslint-disable-next-line no-console -- surface the isolated push builder failure in the Convex logs
				console.error(
					`[notify:${kind}] push message for ${recipient.email} failed`,
					err
				);
				return { recipient, message: undefined };
			}
		});
		const rows = outgoing.flatMap(({ recipient, message }) =>
			message
				? [
						{
							personId: recipient.personId,
							title: message.title,
							body: message.body,
							url: appPath(message.url),
						},
					]
				: []
		);

		if (rows.length > 0) {
			try {
				await ctx.runMutation(internal.notify.inbox.record, {
					kind,
					rows,
				});
			} catch (err) {
				// eslint-disable-next-line no-console -- surface the failed history write in the Convex logs; delivery goes on
				console.error(`[notify:${kind}] history write failed`, err);
			}
		}

		async function deliver({
			recipient,
			message,
		}: Outgoing): Promise<Tally> {
			const tally: Tally = { delivered: 0, failed: 0 };
			const pref = prefFor(recipient.prefs, def.category);
			const wantsPush = pref.push && recipient.subscriptions.length > 0;
			if (wantsPush && !message) {
				tally.failed += 1;
			} else if (wantsPush && message) {
				try {
					const sent: PushSendResult = await ctx.runAction(
						internal.notify.channels.push.send,
						{ subscriptions: recipient.subscriptions, message }
					);
					tally.delivered += sent.delivered;
					tally.failed += sent.failed;
				} catch (err) {
					tally.failed += 1;
					// eslint-disable-next-line no-console -- surface the isolated push failure in the Convex logs
					console.error(
						`[notify:${kind}] push to ${recipient.email} failed`,
						err
					);
				}
			}
			if (def.email && pref.email) {
				try {
					const email = def.email(payload, recipient);
					if (email) {
						await sendNotificationEmail(
							recipient.email,
							kind,
							email
						);
						tally.delivered += 1;
					}
				} catch (err) {
					tally.failed += 1;
					// eslint-disable-next-line no-console -- surface the isolated email failure in the Convex logs
					console.error(
						`[notify:${kind}] email to ${recipient.email} failed`,
						err
					);
				}
			}
			return tally;
		}

		const tallies = await mapWithConcurrency(
			outgoing,
			CONCURRENCY,
			deliver
		);
		return {
			recipients: recipients.length,
			delivered: tallies.reduce((sum, t) => sum + t.delivered, 0),
			failed: tallies.reduce((sum, t) => sum + t.failed, 0),
		};
	},
});
