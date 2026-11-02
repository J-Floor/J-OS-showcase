import { Button, TextArea } from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import { Show, createMemo, createSignal, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isPerkExpired } from "../../../convex/lib/perks.ts";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { TEXT_MAX } from "../../../convex/lib/validate.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { call } from "../../lib/call.ts";
import { APP_NAME } from "../../lib/constants.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { formatDateIn } from "../../shared/time.ts";
import { toaster } from "../../shared/toaster.ts";

import styles from "./PerkSheet.module.scss";
import { useMyOpenRequest } from "./useMyOpenRequest.ts";

/** Who reads the note when the perk names no contact. */
const TEAM_NAME = `the ${APP_NAME} team`;

/** `requestPerk`'s args. A blank note is no note: the field stays off the
 *  call instead of arriving empty. */
function requestArgs(
	perkId: Id<"perks">,
	note: string
): FunctionArgs<typeof api.perkRequests.requestPerk> {
	const trimmed = note.trim();
	return trimmed === "" ? { perkId } : { perkId, note: trimmed };
}

/** The toast once a request is in. The contact is who follows up, so it
 *  names them, by the first name on their record, when the perk has one. */
function sentMessage(contactFirstName: string | undefined): string {
	return contactFirstName
		? `Request sent. ${contactFirstName} will be in touch.`
		: "Request sent.";
}

/**
 * The viewer's request for the shown perk: the note being written, the
 * request already open, and the Request action behind the footer button.
 * `perk` is undefined while the sheet shows its skeleton. The server keeps
 * one open request per person per perk and answers a repeat with that one,
 * so a double click sends a single request.
 */
export function createPerkRequestForm(options: {
	perk: Accessor<PerkRow | undefined>;
}) {
	const requestPerk = useMutation(api.perkRequests.requestPerk);
	// The id, not the row: a live refetch hands over a new row for the same
	// perk, which is no move to another perk.
	const perkId = createMemo(() => options.perk()?._id);
	const openRequest = useMyOpenRequest(() => perkId());
	const [note, setNote] = createSignal("");
	const [noteOpened, setNoteOpened] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	// Keyed on the perk: a refusal for one perk never shows on the next.
	const { error, trackResult, clear } = createActionError(() => perkId());

	function isExpired(): boolean {
		const perk = options.perk();
		return perk !== undefined && isPerkExpired(perk.validUntil, Date.now());
	}

	/** The note field shows: a loaded, active perk the viewer has no open
	 *  request for. A memo, so it changes only when the field comes or goes,
	 *  never on a refetch of the same perk. */
	const canWriteNote = createMemo(
		() =>
			options.perk() !== undefined &&
			!isExpired() &&
			openRequest() === undefined
	);

	async function submit(): Promise<void> {
		const perk = options.perk();
		if (perk === undefined || submitting()) return;
		setSubmitting(true);
		const result = await trackResult(
			call(
				requestPerk.mutateAsync(requestArgs(perk._id, note())),
				"Could not send the request."
			)
		);
		setSubmitting(false);
		if (result.isErr()) return;
		setNote("");
		setNoteOpened(false);
		toaster.create({
			type: "success",
			title: sentMessage(perk.contactFirstName),
		});
	}

	return {
		note,
		setNote,
		submitting,
		error,
		submit,
		openRequest,
		isExpired,
		canWriteNote,
		/** The field shows, not the "Add a note" button: it was opened, or
		 *  holds text. */
		isNoteShown: () => noteOpened() || note() !== "",
		openNote() {
			setNoteOpened(true);
		},
		/** An empty, closed note and no refusal left over. */
		reset() {
			setNote("");
			setNoteOpened(false);
			clear();
		},
	};
}

export type PerkRequestForm = ReturnType<typeof createPerkRequestForm>;

/** The field was opened to be typed in: focus it once it is in the page.
 *  Plain `autofocus` does not fire on a field inserted after page load. */
function focusOnMount(field: HTMLTextAreaElement): void {
	queueMicrotask(() => {
		field.focus();
	});
}

/** The footer's note, right above the Request button. While the viewer has
 *  an open request that carried a note, the note as it was sent, read-only.
 *  Otherwise, closed and empty it is a tertiary "Add a note" button, so a
 *  request with no note stays one click; opened it is the field. Nothing
 *  for an open request without a note. */
export function PerkRequestNote(props: {
	form: PerkRequestForm;
	perk: Accessor<PerkRow>;
}) {
	return (
		<Show
			when={props.form.openRequest()?.note}
			fallback={<NoteComposer form={props.form} perk={props.perk} />}
		>
			{(sent) => (
				<div class={styles.sentNote}>
					<span class={styles.sentNoteLabel}>Your note</span>
					<p class={styles.note}>{sent()}</p>
				</div>
			)}
		</Show>
	);
}

/** The optional note being written, or the button that opens it. */
function NoteComposer(props: {
	form: PerkRequestForm;
	perk: Accessor<PerkRow>;
}) {
	return (
		<Show when={props.form.canWriteNote()}>
			<Show
				when={props.form.isNoteShown()}
				fallback={
					<Button
						variant="tertiary"
						onClick={() => {
							props.form.openNote();
						}}
					>
						Add a note
					</Button>
				}
			>
				<TextArea
					label={`Note for ${props.perk().contactFirstName ?? TEAM_NAME}`}
					helperText="Optional. Only the board reads it."
					autoresize
					ref={focusOnMount}
					maxLength={TEXT_MAX}
					value={props.form.note()}
					onInput={(value) => {
						props.form.setNote(value);
					}}
				/>
			</Show>
		</Show>
	);
}

/** The footer's Request button. While a request is open it says when it
 *  went, which needs no further reason; on an expired perk it says why it
 *  is off. */
export function PerkRequestButton(props: { form: PerkRequestForm }) {
	return (
		<Show
			when={props.form.openRequest()}
			fallback={
				<Button
					disabled={props.form.isExpired()}
					disabledReason="This perk has expired"
					isLoading={props.form.submitting()}
					onClick={() => {
						void props.form.submit();
					}}
				>
					Request perk
				</Button>
			}
		>
			{(request) => (
				<Button disabled shamefullyOmitDisabledReason>
					Requested on{" "}
					{formatDateIn(request().requestedAt, SITE_TIMEZONE)}
				</Button>
			)}
		</Show>
	);
}
