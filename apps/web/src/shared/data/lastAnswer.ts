import { isKeeperActive } from "./queryKeeper.ts";

/**
 * The last answer of an action-backed readout (occupancy), so a card shows
 * the known state at once on its next mount and refreshes from there. Actions
 * are not subscriptions, so the query keeper cannot hold them. In memory only,
 * and only while the keeper is on (a session is known): `endDataSession` and
 * `clearDataCaches` empty it, and an answer landing after that is dropped.
 */
const answers = new Map<string, { value: unknown; at: number }>();

/** The remembered answer, or `undefined` when there is none or it is older
 *  than `maxAgeMs`. A caller passes its own poll interval, so a remembered
 *  answer is never staler than what the live card would show between polls. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the stored type
export function lastAnswer<T>(key: string, maxAgeMs: number): T | undefined {
	const entry = answers.get(key);
	if (!entry || Date.now() - entry.at > maxAgeMs) return undefined;
	return entry.value as T;
}

export function rememberAnswer(key: string, value: unknown): void {
	if (!isKeeperActive()) return;
	answers.set(key, { value, at: Date.now() });
}

export function clearAnswers(): void {
	answers.clear();
}
