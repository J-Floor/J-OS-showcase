import {
	Avatar,
	Button,
	morphPart,
	Skeleton,
	TextArea,
} from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { For, Show, createSignal } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { TEXT_MAX } from "../../../../convex/lib/validate.ts";
import { call } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import { formatAgo } from "../../../shared/time.ts";
import { personFields } from "../fields.ts";
import { noteAuthor } from "../noteAuthor.ts";

import styles from "./BoardNotes.module.scss";

type NoteLogEntry = NonNullable<
	NonNullable<Doc<"people">["board"]>["noteLog"]
>[number];

/** One note: its author's avatar and name (skeletons while the board list
 *  loads), when it was written, and the text. */
function NoteEntry(props: { entry: NoteLogEntry; author: string | undefined }) {
	return (
		<li class={styles.entry}>
			<Show
				when={props.author}
				fallback={<Skeleton class={styles.avatarSkeleton} />}
			>
				{(name) => <Avatar name={name()} class={styles.avatar} />}
			</Show>
			<div class={styles.entryBody}>
				<div class={styles.meta}>
					<span class={styles.author}>
						<Show
							when={props.author}
							fallback={<Skeleton width="short" />}
						>
							{(name) => name()}
						</Show>
					</span>
					<span class={styles.time}>{formatAgo(props.entry.at)}</span>
				</div>
				<p class={styles.text}>{props.entry.text}</p>
			</div>
		</li>
	);
}

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
	const { error: noteError, trackResult } = createActionError();
	let isSaving = false;

	function notes() {
		return props.person.board?.noteLog ?? [];
	}
	async function submit(): Promise<void> {
		const text = draft().trim();
		// Enter and blur both submit; the draft outlives the save, so
		// without this one note would be sent twice.
		if (!text || isSaving) return;
		isSaving = true;
		const result = await trackResult(
			call(
				addNote.mutateAsync({ id: props.person._id, text }),
				"Could not save the note."
			)
		);
		isSaving = false;
		if (result.isErr()) return;
		setDraft("");
	}

	return (
		<div class={styles.notes} {...morphPart(personFields.notes)}>
			<Show
				when={notes().length > 0}
				fallback={<p class={styles.empty}>No notes yet.</p>}
			>
				<ul class={styles.thread}>
					<For each={notes()}>
						{(entry) => (
							<NoteEntry
								entry={entry}
								author={noteAuthor(
									boardLevel.data(),
									entry.authorId
								)}
							/>
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
				<InlineError message={noteError()} />
				<div class={styles.composerActions}>
					<Button
						disabled={!draft().trim()}
						disabledReason="Write a note first"
						onClick={() => void submit()}
					>
						Add note
					</Button>
				</div>
			</div>
		</div>
	);
}
