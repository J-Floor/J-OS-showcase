import { Accordion, Button, PropertyRow, TextArea } from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import { Show, createMemo, createSignal, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isPerkExpired } from "../../../convex/lib/perks.ts";
import { TEXT_MAX } from "../../../convex/lib/validate.ts";
import type { MyOpenPerkRequest } from "../../../convex/perkRequests.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { call } from "../../lib/call.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { ICONS } from "../../shared/icons.ts";
import { formatDate } from "../../shared/time.ts";
import { toaster } from "../../shared/toaster.ts";

import styles from "./PerkSheet.module.scss";
import { useMyOpenRequest } from "./useMyOpenRequest.ts";

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
		/** "Your request" shows: the perk can still be asked for, or the
		 *  viewer already asked. */
		hasSection(): boolean {
			return openRequest() !== undefined || !isExpired();
		},
		/** An empty note and no refusal left over. */
		reset() {
			setNote("");
			clear();
		},
	};
}

export type PerkRequestForm = ReturnType<typeof createPerkRequestForm>;

/** A request the viewer already sent: when it went and the note it
 *  carried. A sent note cannot be changed. */
function SentRequest(props: { request: Accessor<MyOpenPerkRequest> }) {
	return (
		<>
			<PropertyRow icon={ICONS.date} label="Requested on">
				<span>{formatDate(props.request().requestedAt)}</span>
			</PropertyRow>
			<Show when={props.request().note}>
				{(note) => (
					<PropertyRow icon={ICONS.description} label="Your note">
						<p class={styles.note}>{note()}</p>
					</PropertyRow>
				)}
			</Show>
		</>
	);
}

/** The "Your request" section: an optional note for the contact, sent by
 *  the footer's Request button; once sent, when it went and what it said. */
export function PerkRequestSection(props: { form: PerkRequestForm }) {
	return (
		<Accordion.Item value="request">
			<Accordion.ItemTitle>Your request</Accordion.ItemTitle>
			<Accordion.ItemContent>
				<div class={styles.section}>
					<Show
						when={props.form.openRequest()}
						fallback={
							<TextArea
								label="Note for the J floor contact"
								helperText="Optional. Only the board reads it."
								autoresize
								maxLength={TEXT_MAX}
								value={props.form.note()}
								onInput={(value) => {
									props.form.setNote(value);
								}}
							/>
						}
					>
						{(request) => <SentRequest request={request} />}
					</Show>
				</div>
			</Accordion.ItemContent>
		</Accordion.Item>
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
					Requested on {formatDate(request().requestedAt)}
				</Button>
			)}
		</Show>
	);
}
