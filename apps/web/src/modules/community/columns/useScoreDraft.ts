import { useMutation } from "convex-solidjs";
import { createSignal } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";

/**
 * The half-typed score a board member is editing, and how it reaches the
 * server. Shared by the roster's score cell and the sheet's score field so
 * the two commit rules cannot drift.
 *
 * While editing, the field shows the draft; otherwise it mirrors the server.
 * The draft is cleared only once the server has the value, so the field never
 * flashes back to the old score between commit and refetch.
 */
export function useScoreDraft(options: {
	personId: () => Id<"people">;
	currentScore: () => number | undefined;
	canScore: () => boolean;
}) {
	const setScore = useMutation(api.applications.setScore);
	const [draft, setDraft] = createSignal<string | null>(null);
	const { error, trackResult } = createActionError(options.personId);

	function display(): string {
		const typed = draft();
		if (typed !== null) return typed;
		const score = options.currentScore();
		return score === undefined ? "" : String(score);
	}

	async function save(args: {
		personId: Id<"people">;
		value?: number;
	}): Promise<void> {
		await trackResult(
			call(setScore.mutateAsync(args), "Could not save the score.")
		);
		// Err or Ok, the field goes back to mirroring the server: on a refusal
		// that is the score the board still has, not the one that was typed.
		setDraft(null);
	}

	function commit(): void {
		const value = draft();
		if (value === null || !options.canScore()) {
			setDraft(null);
			return;
		}
		// Empty = clear the score (the board un-rating); no-op if already unscored.
		if (value === "") {
			if (options.currentScore() === undefined) {
				setDraft(null);
				return;
			}
			void save({ personId: options.personId() });
			return;
		}
		const parsed = Number(value);
		if (Number.isNaN(parsed) || parsed === options.currentScore()) {
			setDraft(null);
			return;
		}
		void save({ personId: options.personId(), value: parsed });
	}

	return { draft, setDraft, display, commit, error };
}
