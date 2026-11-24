import { useSaveTracker } from "@j-os/design-system";
import type { Result } from "neverthrow";
import type { Accessor } from "solid-js";

import { call, type ClientError } from "../../lib/call.ts";
import {
	type ActionErrorState,
	createActionError,
	scopeOfFields,
} from "../createActionError.ts";
import { reportSave } from "../reportSave.ts";

const SAVE_FAILED = "Could not save that change.";

type AttemptCallback = (result: Result<unknown, ClientError>) => void;

/** A field-by-field sheet editor's save: each change is written at once,
 *  reported to the sheet's save status (tracker), and its refusal shows
 *  under the fields for the row it was made for; once the sheet has
 *  closed, it toasts instead (reportSave). The sheet's error area comes
 *  back with `patch`, so a row with its own write (`trackResult`) can
 *  report into the same area. */
export function createEntityPatch<
	Patch extends object,
	Key extends string = string,
>(options: {
	/** The row the sheet shows; a refusal belongs to it. */
	key: () => Key;
	/** Write `change` to the row `key()` named when the change was made:
	 *  the mutation call itself. A failure the server did not explain
	 *  reads "Could not save that change." */
	write: (key: Key, change: Patch) => Promise<unknown>;
	isOpen: Accessor<boolean>;
}): ActionErrorState & {
	/** `onAttempt` hears the Result of every attempt (the first send and
	 *  each Retry from the save status). */
	patch: (change: Patch, onAttempt?: AttemptCallback) => void;
} {
	const tracker = useSaveTracker();
	const failure = createActionError(options.key);
	function patch(change: Patch, onAttempt?: AttemptCallback): void {
		// Taken now: a Retry writes to the row the change was made on.
		const key = options.key();
		const scope = scopeOfFields(change);
		reportSave(
			tracker?.track(scope),
			() => {
				const result = failure.trackResult(
					call(options.write(key, change), SAVE_FAILED),
					scope
				);
				void result.then((settled) => {
					onAttempt?.(settled);
				});
				return result;
			},
			options.isOpen
		);
	}
	return { ...failure, patch };
}
