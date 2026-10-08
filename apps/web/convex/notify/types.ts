import type { GenericValidator, Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import type { Category, NotificationPrefs } from "./categories.ts";

/** What the service worker shows (`public/push-sw.js` parses exactly this). */
export type PushMessage = {
	title: string;
	body: string;
	url: string;
	/** Collapses repeats of the same notification on the device. */
	tag: string;
};

export type EmailMessage = { subject: string; html: string; text: string };

export type PushKeys = { endpoint: string; p256dh: string; auth: string };

export type Recipient = {
	personId: Id<"people">;
	email: string;
	firstName: string;
	tier: Doc<"people">["tier"];
	prefs: NotificationPrefs | undefined;
};

export type ResolvedRecipient = Recipient & { subscriptions: PushKeys[] };

/**
 * One notification kind: who gets it and how it reads on each channel.
 * Every kind has `push`: its message is also the row kept in each recipient's
 * notification history (`notify/inbox.ts`). `email` absent = push-only.
 * `email` may return null to skip one recipient's email (e.g. a person who
 * already gets a transactional email for the same event).
 */
export type KindDef<V extends GenericValidator> = {
	category: Category;
	payload: V;
	audience: (ctx: QueryCtx, payload: Infer<V>) => Promise<Id<"people">[]>;
	push: (payload: Infer<V>, recipient: Recipient) => PushMessage;
	email?: (payload: Infer<V>, recipient: Recipient) => EmailMessage | null;
};

export type AnyKindDef = KindDef<GenericValidator>;

/** Identity helper so each kind file infers its payload type from its validator. */
export function defineKind<V extends GenericValidator>(
	def: KindDef<V>
): KindDef<V> {
	return def;
}

export type PushSendResult = { delivered: number; failed: number };

/** `delivered` and `failed` count push messages per device plus emails per
 *  person, so one recipient can add several. A skipped channel adds nothing. */
export type DispatchResult = {
	recipients: number;
	delivered: number;
	failed: number;
};
