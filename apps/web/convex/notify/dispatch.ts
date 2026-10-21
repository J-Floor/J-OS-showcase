import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";

import { prefFor } from "./categories.ts";
import { sendNotificationEmail } from "./channels/email.ts";
import { appPath } from "./inbox.ts";
import { kindDefinition, kindValidator, type KindName } from "./registry.ts";
import type {
	AnyKindDefinition,
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

type DeliveryTarget = {
	kind: KindName;
	definition: AnyKindDefinition;
	payload: unknown;
};

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	function_: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array<R>(items.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await function_(items[index]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker)
	);
	return results;
}

function buildOutgoing(
	{ kind, definition, payload }: DeliveryTarget,
	recipients: readonly ResolvedRecipient[]
): Outgoing[] {
	return recipients.map((recipient) => {
		try {
			return { recipient, message: definition.push(payload, recipient) };
		} catch (err) {
			// eslint-disable-next-line no-console -- surface the isolated push builder failure in the Convex logs
			console.error(
				`[notify:${kind}] push message for ${recipient.email} failed`,
				err
			);
			return { recipient, message: undefined };
		}
	});
}

function toHistoryRows(outgoing: readonly Outgoing[]) {
	return outgoing.flatMap(({ recipient, message }) =>
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
}

async function recordHistory(
	context: ActionCtx,
	kind: KindName,
	outgoing: readonly Outgoing[]
): Promise<void> {
	const rows = toHistoryRows(outgoing);
	if (rows.length === 0) return;
	try {
		await context.runMutation(internal.notify.inbox.record, {
			kind,
			rows,
		});
	} catch (err) {
		// eslint-disable-next-line no-console -- surface the failed history write in the Convex logs; delivery goes on
		console.error(`[notify:${kind}] history write failed`, err);
	}
}

async function deliverPush(
	context: ActionCtx,
	kind: KindName,
	{ recipient, message }: Outgoing
): Promise<Tally> {
	const tally: Tally = { delivered: 0, failed: 0 };
	if (!message) {
		tally.failed += 1;
		return tally;
	}
	try {
		const sent: PushSendResult = await context.runAction(
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
	return tally;
}

async function deliverEmail(
	{ kind, definition, payload }: DeliveryTarget,
	recipient: ResolvedRecipient
): Promise<Tally> {
	const tally: Tally = { delivered: 0, failed: 0 };
	try {
		const email = definition.email?.(payload, recipient);
		if (email) {
			const sent = await sendNotificationEmail(
				recipient.email,
				kind,
				email
			);
			if (sent.isErr()) {
				tally.failed += 1;
				// eslint-disable-next-line no-console -- surface the isolated email failure in the Convex logs
				console.error(
					`[notify:${kind}] email to ${recipient.email} failed`,
					sent.error.type
				);
			} else tally.delivered += 1;
		}
	} catch (err) {
		tally.failed += 1;
		// eslint-disable-next-line no-console -- surface the isolated email failure in the Convex logs
		console.error(
			`[notify:${kind}] email to ${recipient.email} failed`,
			err
		);
	}
	return tally;
}

async function deliver(
	context: ActionCtx,
	target: DeliveryTarget,
	outgoing: Outgoing
): Promise<Tally> {
	const { recipient } = outgoing;
	const pref = prefFor(recipient.prefs, target.definition.category);
	const isPushWanted = pref.push && recipient.subscriptions.length > 0;
	const pushTally: Tally = isPushWanted
		? await deliverPush(context, target.kind, outgoing)
		: { delivered: 0, failed: 0 };
	const emailTally: Tally =
		target.definition.email && pref.email
			? await deliverEmail(target, recipient)
			: { delivered: 0, failed: 0 };
	return {
		delivered: pushTally.delivered + emailTally.delivered,
		failed: pushTally.failed + emailTally.failed,
	};
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
	handler: async (context, args): Promise<DispatchResult> => {
		const { kind } = args;
		const target: DeliveryTarget = {
			kind,
			definition: kindDefinition(kind),
			payload: args.payload,
		};
		const recipients: ResolvedRecipient[] = await context.runQuery(
			internal.notify.recipients.resolve,
			{ kind, payload: target.payload }
		);
		const outgoing = buildOutgoing(target, recipients);
		await recordHistory(context, kind, outgoing);

		const tallies = await mapWithConcurrency(
			outgoing,
			CONCURRENCY,
			(entry) => deliver(context, target, entry)
		);
		return {
			recipients: recipients.length,
			delivered: tallies.reduce((sum, tally) => sum + tally.delivered, 0),
			failed: tallies.reduce((sum, tally) => sum + tally.failed, 0),
		};
	},
});
