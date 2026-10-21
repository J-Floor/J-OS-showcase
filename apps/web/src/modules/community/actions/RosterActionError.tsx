import type { ResultAsync } from "neverthrow";
import { createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { ClientError } from "../../../lib/call.ts";
import { isLateAnswer } from "../../../shared/createActionError.ts";
import { InlineError } from "../../../shared/InlineError.tsx";

import type { SettledAction, ShortcutScope } from "./shortcuts.ts";

type PersonId = Id<"people">;

/** The last failure of a tab, and who it was for (`undefined` for a batch). */
type Failure = { message: string; personId: PersonId | undefined };

/** One tab's failure area. Tabs stay mounted, so each owns its own state: a
 *  refusal on Guests must not appear on Members. */
type TabState = {
	failure: () => Failure | null;
	setFailure: (failure: Failure | null) => void;
	/** The person the drawer shows right now, if it is open. */
	shown: string | undefined;
};

/** Keyed by tab, at module level: the actions that fail (row buttons, the
 *  drawer's decision bar, key bindings, batch runs) and the two areas that
 *  show it (the strip above the table, the drawer footer) sit in different
 *  parts of a tab's tree, and each tab must keep its own failure. */
const tabs = new Map<ShortcutScope, TabState>();

function tabState(scope: ShortcutScope): TabState {
	const existing = tabs.get(scope);
	if (existing) return existing;
	const [failure, setFailure] = createSignal<Failure | null>(null);
	const created: TabState = { failure, setFailure, shown: undefined };
	tabs.set(scope, created);
	return created;
}

/**
 * Tell the tab which person its drawer shows (`undefined` when closed).
 * Changing it drops the old failure: it belonged to someone else, or to the
 * strip above a table that is now covered.
 */
export function setShownPerson(
	scope: ShortcutScope,
	personId: string | undefined
): void {
	const state = tabState(scope);
	state.shown = personId;
	state.setFailure(null);
}

/**
 * Await a roster action, showing its failure where the board is looking.
 * Resolves to whether it was refused, so a caller can stop a batch or keep a
 * ring in place.
 * An answer for a person the drawer has since moved off is dropped.
 */
export async function settleRosterAction(
	scope: ShortcutScope,
	personId: PersonId | undefined,
	action: ResultAsync<unknown, ClientError>
): Promise<SettledAction> {
	const state = tabState(scope);
	state.setFailure(null);
	const result = await action;
	if (result.isErr() && !isLateAnswer(personId, state.shown))
		state.setFailure({ message: result.error.message, personId });
	return { refused: result.isErr() };
}

/**
 * The tab's last failed action, in the drawer footer (`personId` = who it
 * shows) or in the strip above the table (`personId` omitted).
 */
export function RosterActionError(props: {
	scope: ShortcutScope;
	personId?: PersonId;
}): JSX.Element {
	function message(): string | null {
		const failure = tabState(props.scope).failure();
		if (!failure) return null;
		// The strip (no `personId`) shows whatever failed; the drawer only what
		// concerns its person or a whole batch.
		return props.personId === undefined ||
			failure.personId === undefined ||
			failure.personId === props.personId
			? failure.message
			: null;
	}
	return <InlineError message={message()} />;
}
