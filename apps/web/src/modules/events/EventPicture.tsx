import { Button, PropertyRow } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import type { Result } from "neverthrow";
import { createSignal, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { TV_IMAGE_ACCEPT } from "../../../convex/lib/tv/constants.ts";
import { call, type ClientError } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { postFile, UPLOAD_FAILED } from "../../shared/postFile.ts";
import { tvImageProblem } from "../../shared/tvImageProblem.ts";

import type { EventPatch } from "./EventDetails.tsx";
import styles from "./EventPicture.module.scss";
import { eventFields } from "./fields.ts";

/** The save call: `onAttempt` hears the Result of every attempt, the first
 *  send and each Retry from the save status. */
type PatchPicture = (
	patch: EventPatch,
	onAttempt?: (result: Result<unknown, ClientError>) => void
) => void;

/** The server looked at the blob and said it is not a usable image; any
 *  other failure (network, a refused write) leaves the blob to retry. */
function isImageRefusal(error: ClientError): boolean {
	return error.code === "TvImageInvalid";
}

/** Uploading a chosen file and saving it as the event's picture. A file
 *  that is not an image, is too big, or fails to upload sets the inline
 *  error message.
 *  A save the server refuses discards the upload so it leaves no orphaned
 *  blob; a save that merely failed to get through keeps it, so the save
 *  status's Retry can send the same picture again. Picks made while one is
 *  running are ignored (`isBusy`). */
function createPictureUpload(patchPicture: PatchPicture) {
	const generateUploadUrl = useMutation(
		api.events.generateEventPictureUploadUrl
	);
	const discardUpload = useMutation(api.events.discardEventPictureUpload);
	const [problem, setProblem] = createSignal<string | null>(null);
	const [isBusy, setBusy] = createSignal(false);

	async function discard(fileId: Id<"_storage">) {
		// Nobody to tell if the cleanup fails: the save's own refusal shows.
		await call(discardUpload.mutateAsync({ fileId }), UPLOAD_FAILED).match(
			() => null,
			() => null
		);
	}

	function save(fileId: Id<"_storage">): Promise<void> {
		return new Promise((resolve) => {
			patchPicture({ pictureId: fileId }, (result) => {
				if (result.isErr() && isImageRefusal(result.error)) {
					void discard(fileId);
				}
				resolve();
			});
		});
	}

	async function upload(file: File) {
		if (isBusy()) return;
		setProblem(null);
		const refused = tvImageProblem(file);
		if (refused) {
			setProblem(refused);
			return;
		}
		setBusy(true);
		try {
			const uploaded = await call(
				generateUploadUrl.mutateAsync({}),
				UPLOAD_FAILED
			).andThen((target) => postFile(target, file));
			if (uploaded.isErr()) setProblem(uploaded.error.message);
			else await save(uploaded.value);
		} finally {
			setBusy(false);
		}
	}

	function remove() {
		setProblem(null);
		// A refusal shows in the sheet's error area; nothing to clean up.
		patchPicture({ pictureId: null });
	}

	return { problem, isBusy, upload, remove };
}

/** The picture's URL, never the previous event's while the next one loads. */
function useEventPictureUrl(eventId: Accessor<Id<"events">>) {
	return useQuery(
		api.events.getEventPictureUrl,
		() => ({ eventId: eventId() }),
		{ keepPreviousData: false }
	);
}

/** The event's picture: shown to everyone who sees the sheet, uploaded,
 *  replaced or removed while editing. `onPatch` saves `{ pictureId }`. */
export function EventPicture(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	onPatch: PatchPicture;
}): JSX.Element {
	const url = useEventPictureUrl(() => props.event()._id);
	const picture = createPictureUpload((patch, onAttempt) => {
		props.onPatch(patch, onAttempt);
	});
	let input: HTMLInputElement | undefined;

	return (
		<PropertyRow
			label={eventFields.picture.label}
			icon={eventFields.picture.icon}
		>
			<div class={styles.picture}>
				<Show when={url.data()}>
					{(source) => (
						<div class={styles.preview}>
							<img
								class={styles.image}
								src={source()}
								alt={props.event().name}
							/>
						</div>
					)}
				</Show>
				<Show
					when={props.isEditing()}
					fallback={
						<Show when={url.data() === null}>
							<span class={styles.hint}>No picture</span>
						</Show>
					}
				>
					<div class={styles.actions}>
						<input
							ref={input}
							class={styles.fileInput}
							type="file"
							accept={TV_IMAGE_ACCEPT}
							disabled={picture.isBusy()}
							aria-label="Event picture file"
							onChange={(event) => {
								const chosen = event.currentTarget.files?.[0];
								event.currentTarget.value = "";
								if (chosen) void picture.upload(chosen);
							}}
						/>
						<Button
							variant="secondary"
							isLoading={picture.isBusy()}
							onClick={() => {
								input?.click();
							}}
						>
							{url.data()
								? "Replace picture"
								: "Choose a picture"}
						</Button>
						<Show when={url.data()}>
							<Button
								variant="secondary"
								isLoading={picture.isBusy()}
								onClick={() => {
									picture.remove();
								}}
							>
								Remove picture
							</Button>
						</Show>
					</div>
					<InlineError message={picture.problem()} />
				</Show>
			</div>
		</PropertyRow>
	);
}
