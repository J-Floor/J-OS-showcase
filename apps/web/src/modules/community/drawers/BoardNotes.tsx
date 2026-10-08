import { Avatar, Button, TextArea } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { For, Show, createSignal } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { TEXT_MAX } from "../../../../convex/lib/validate.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { formatAgo } from "../../../shared/time.ts";

import styles from "./BoardNotes.module.scss";

/**
 * The board's notes on a person, as an attributed thread: who wrote each note
 * and when, oldest first, with a composer to add another. Replaces the single
 * shared free-text field where the board prefixed their own initials by hand —
 * the author is attached automatically now (whoever is signed in), so the note
 * itself carries the attribution the manual convention used to.
 */
export function BoardNotes(props: { person: Doc<"people"> }) {
	const boardLevel = useBoardLevel();
	const addNote = useMutation(api.people.addNote);
	const [draft, setDraft] = createSignal("");

	function notes() {
		return props.person.board?.noteLog ?? [];
	}
	// The one migrated legacy note has no author; a note by someone no longer on
	// the board resolves to nothing here either. Both read as "Board" — the same
	// thing the old "[name]:" blob said when it said nothing.
	function authorName(id: Id<"people"> | undefined): string {
		if (!id) return "Board";
		const s = (boardLevel.data() ?? []).find((p) => p._id === id);
		return s ? `${s.firstName} ${s.lastName}`.trim() : "Board";
	}
	function submit(): void {
		const text = draft().trim();
		if (!text) return;
		void addNote.mutateAsync({ id: props.person._id, text });
		setDraft("");
	}

	return (
		<div class={styles.notes}>
			<Show
				when={notes().length > 0}
				fallback={<p class={styles.empty}>No notes yet.</p>}
			>
				<ul class={styles.thread}>
					<For each={notes()}>
						{(entry) => (
							<li class={styles.entry}>
								<Avatar
									name={authorName(entry.authorId)}
									class={styles.avatar}
								/>
								<div class={styles.entryBody}>
									<div class={styles.meta}>
										<span class={styles.author}>
											{authorName(entry.authorId)}
										</span>
										<span class={styles.time}>
											{formatAgo(entry.at)}
										</span>
									</div>
									<p class={styles.text}>{entry.text}</p>
								</div>
							</li>
						)}
					</For>
				</ul>
			</Show>
			<div class={styles.composer}>
				<TextArea
					label=""
					aria-label="Add a note"
					placeholder="Add a note…"
					autoresize
					maxLength={TEXT_MAX}
					value={draft()}
					onInput={(value) => {
						setDraft(value);
					}}
				/>
				<div class={styles.composerActions}>
					<Button
						disabled={!draft().trim()}
						disabledReason="Write a note first"
						onClick={submit}
					>
						Add note
					</Button>
				</div>
			</div>
		</div>
	);
}
