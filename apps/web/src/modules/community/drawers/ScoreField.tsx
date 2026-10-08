import { Kbd, NumberInput } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	useContext,
} from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CurrentPersonContext } from "../columns/applicationColumns.tsx";

import styles from "./ScoreField.module.scss";

/**
 * Score editor for the Applications drawer footer — the board sets an applicant's
 * (shared) score without leaving the drawer, above the decision buttons. Commits
 * on blur and only when it actually changed, so opening the drawer never refetches
 * the roster. Board-only, the same gate as the roster's score cell.
 */
export function ScoreField(props: { person: Doc<"people"> }) {
	const currentPerson = useContext(CurrentPersonContext);
	const setScore = useMutation(api.applications.setScore);
	const [draft, setDraft] = createSignal<string | null>(null);

	// The footer stays mounted while the drawer pages person to person, so drop
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

	function display(): string {
		const d = draft();
		if (d !== null) return d;
		const score = props.person.board?.score;
		return score !== undefined ? String(score) : "";
	}

	function commit(): void {
		const value = draft();
		if (value === null || !currentPerson()) {
			setDraft(null);
			return;
		}
		// Empty = clear the score (the board un-rating); no-op if already unscored.
		if (value === "") {
			if (props.person.board?.score === undefined) {
				setDraft(null);
				return;
			}
			void setScore
				.mutateAsync({ personId: props.person._id })
				.finally(() => setDraft(null));
			return;
		}
		const num = Number(value);
		if (Number.isNaN(num) || num === props.person.board?.score) {
			setDraft(null);
			return;
		}
		void setScore
			.mutateAsync({ personId: props.person._id, value: num })
			.finally(() => setDraft(null));
	}

	// The clear button is a discrete action that must commit at once (a click
	// inside the field does not reliably blur the input). Typing to empty is NOT
	// a clear — selecting the score and retyping produces a transient "" that must
	// stay deferred to blur. So distinguish the two by the interaction: a
	// pointerdown on the clear button (caught on capture, before ark's handler)
	// marks the next value change as a discrete clear.
	let clearPressed = false;
	onMount(() => {
		function onDown(event: PointerEvent) {
			clearPressed =
				(event.target as Element | null)?.closest(
					'button[aria-label="Clear"]'
				) != null;
		}
		document.addEventListener("pointerdown", onDown, true);
		onCleanup(() => {
			document.removeEventListener("pointerdown", onDown, true);
		});
	});

	return (
		<div class={styles.field}>
			<NumberInput
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
					if (detail.value === "" && clearPressed) {
						clearPressed = false;
						commit();
					}
				}}
			/>
			{/* Peek hint mirroring the roster's score cell: 0–9 is the score's
			    value range. `inline` shows it only while peeking (Alt). */}
			<Kbd label="0–9" inline class={styles.kbd} />
		</div>
	);
}
