import { useMutation } from "convex-solidjs";
import { createSignal } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * The half-typed score a board member is editing, and how it reaches the
 * server. Shared by the roster's score cell and the drawer's score field so
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

	function display(): string {
		const typed = draft();
		if (typed !== null) return typed;
		const score = options.currentScore();
		return score === undefined ? "" : String(score);
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
			void setScore
				.mutateAsync({ personId: options.personId() })
				.finally(() => setDraft(null));
			return;
		}
		const parsed = Number(value);
		if (Number.isNaN(parsed) || parsed === options.currentScore()) {
			setDraft(null);
			return;
		}
		void setScore
			.mutateAsync({ personId: options.personId(), value: parsed })
			.finally(() => setDraft(null));
	}

	return { draft, setDraft, display, commit };
}
