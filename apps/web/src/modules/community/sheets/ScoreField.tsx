import { Kbd, morphPart, NumberInput } from "@j-os/design-system";
import { makeEventListener } from "@solid-primitives/event-listener";
import { createEffect, on, onMount, useContext } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { InlineError } from "../../../shared/InlineError.tsx";
import { CurrentPersonContext } from "../columns/applicationColumns.tsx";
import { useScoreDraft } from "../columns/useScoreDraft.ts";
import { personFields } from "../fields.ts";

import styles from "./ScoreField.module.scss";

/**
 * Score editor for the Applications sheet footer — the board sets an applicant's
 * (shared) score without leaving the sheet, above the decision buttons. Commits
 * on blur and only when it actually changed, so opening the sheet never refetches
 * the roster. Board-only, the same gate as the roster's score cell.
 */
export function ScoreField(props: { person: Doc<"people"> }) {
	const currentPerson = useContext(CurrentPersonContext);
	const { setDraft, draft, display, commit, error } = useScoreDraft({
		personId: () => props.person._id,
		currentScore: () => props.person.board?.score,
		canScore: () => Boolean(currentPerson()),
	});

	// The footer stays mounted while the sheet pages person to person, so drop
	// any half-typed draft when the id changes — otherwise it would show, or on
	// blur even commit, the previous applicant's value onto the new one. Keyed on
	// `_id` (not the object) so a live roster refetch of the SAME person doesn't
	// wipe what's being typed.
	createEffect(
		on(
			() => props.person._id,
			() => {
				setDraft(null);
			}
		)
	);

	// The clear button is a discrete action that must commit at once (a click
	// inside the field does not reliably blur the input). Typing to empty is NOT
	// a clear — selecting the score and retyping produces a transient "" that must
	// stay deferred to blur. So distinguish the two by the interaction: a
	// pointerdown on the clear button (caught on capture, before ark's handler)
	// marks the next value change as a discrete clear.
	let isClearPressed = false;
	function onDown(event: PointerEvent) {
		isClearPressed = Boolean(
			(event.target as Element | null)?.closest(
				'button[aria-label="Clear"]'
			)
		);
	}
	onMount(() => {
		makeEventListener(document, "pointerdown", onDown, true);
	});

	return (
		<div class={styles.field}>
			{/* The number box itself (not the field around it) is what the
			    roster's Score cell flies into: it stays mounted while the
			    sheet is open. */}
			<NumberInput
				{...morphPart(personFields.score)}
				label="Score"
				min={0}
				max={11}
				disabled={!currentPerson()}
				disabledReason="Only board members can score applications"
				allowClearing
				value={display()}
				onFocusChange={(detail) => {
					if (!detail.focused && draft() !== null) commit();
				}}
				onValueChange={(detail) => {
					setDraft(detail.value);
					// Only the clear BUTTON commits immediately; a typed-to-empty
					// value waits for blur like any other edit.
					if (detail.value !== "" || !isClearPressed) return;
					isClearPressed = false;
					commit();
				}}
			/>
			{/* Peek hint mirroring the roster's score cell: 0–9 is the score's
			    value range. `inline` shows it only while peeking (Alt). */}
			<Kbd label="0–9" inline class={styles.kbd} />
			<InlineError message={error()} />
		</div>
	);
}
