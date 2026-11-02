import { Input } from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import { Show, createMemo, createSignal, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isPerkExpired } from "../../../convex/lib/perks.ts";
import { TEXT_MAX } from "../../../convex/lib/validate.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { call } from "../../lib/call.ts";
import { APP_NAME } from "../../lib/constants.ts";
import type { SettledAction } from "../../shared/actions/shortcuts.ts";
import { createActionError } from "../../shared/createActionError.ts";
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

	/** Sends the request. `undefined` when nothing was sent (no perk). A
	 *  second send while one is under way never gets here: the Request
	 *  action runs through `runAction`, which holds it. */
	async function submit(): Promise<SettledAction | undefined> {
		const perk = options.perk();
		if (perk === undefined) return undefined;
		const result = await trackResult(
			call(
				requestPerk.mutateAsync(requestArgs(perk._id, note())),
				"Could not send the request."
			)
		);
		if (result.isErr()) return { refused: true };
		setNote("");
		toaster.create({
			type: "success",
			title: sentMessage(perk.contactFirstName),
		});
		return { refused: false };
	}

	return {
		note,
		setNote,
		error,
		submit,
		openRequest,
		isExpired,
		canWriteNote,
		/** An empty note and no refusal left over. */
		reset() {
			setNote("");
			clear();
		},
	};
}

export type PerkRequestForm = ReturnType<typeof createPerkRequestForm>;

/** The footer's note, above the actions. While the viewer has an open
 *  request that carried a note, the note as it was sent, read-only.
 *  Otherwise, while they can still request, a one-line field: notes are
 *  short, and a request with no note needs no click to skip it. Nothing for
 *  an open request without a note. */
export function PerkRequestNote(props: {
	form: PerkRequestForm;
	perk: Accessor<PerkRow>;
}) {
	return (
		<Show
			when={props.form.openRequest()?.note}
			fallback={<NoteField form={props.form} perk={props.perk} />}
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

/** The optional note being written. */
function NoteField(props: { form: PerkRequestForm; perk: Accessor<PerkRow> }) {
	return (
		<Show when={props.form.canWriteNote()}>
			<Input
				label={`Note for ${props.perk().contactFirstName ?? TEAM_NAME}`}
				placeholder="Optional. Only the board reads it."
				maxLength={TEXT_MAX}
				value={props.form.note()}
				onInput={(event) => {
					props.form.setNote(event.currentTarget.value);
				}}
			/>
		</Show>
	);
}
