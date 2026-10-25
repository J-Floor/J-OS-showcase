import { useSaveTracker } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { createSignal, untrack } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { call } from "../../lib/call.ts";
import { reportSave } from "../../lib/reportSave.ts";
import { createActionError } from "../../shared/createActionError.ts";

const NOTE_FIELD = "note";

/**
 * The board's note composer: a draft, and the save that appends it to the
 * person's attributed thread. Shared by the roster's note cell and the sheet's
 * thread so the two commit rules cannot drift. Inside a sheet the save reports
 * to its save status.
 *
 * Enter and blur both submit and the draft outlives the save, so a save in
 * flight blocks a second one (else one note would be sent twice). `submit(false)`
 * is the blur path: after a refusal it will not send the same text again, only
 * Enter (`submit(true)`) does.
 */
export function useAddNote(personId: () => Id<"people">) {
	const addNote = useMutation(api.people.addNote);
	const tracked = useSaveTracker()?.track(NOTE_FIELD);
	const [draft, setDraft] = createSignal("");
	const { error, trackResult } = createActionError();
	let isSaving = false;
	let refusedText: string | undefined;

	function submit(isRetry = true): void {
		const text = draft().trim();
		if (!text || isSaving || (!isRetry && text === refusedText)) return;
		const id = personId();
		reportSave(
			tracked,
			() => {
				isSaving = true;
				return trackResult(
					call(
						addNote.mutateAsync({ id, text }),
						"Could not save the note."
					)
				).then((result) => {
					isSaving = false;
					if (result.isErr()) {
						refusedText = text;
						return result;
					}
					refusedText = undefined;
					// A note typed since (Retry after a refusal) stays.
					if (untrack(draft).trim() === text) setDraft("");
					return result;
				});
			},
			// The composer shows its own refusal; a closed sheet needs no toast.
			() => true
		);
	}

	return { draft, setDraft, submit, error };
}
