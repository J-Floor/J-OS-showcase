import { Button } from "@j-os/design-system";
import { useAction, useMutation } from "convex-solidjs";
import { createSignal, For, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	TV_MIGRATING_MESSAGE,
	TV_PACK_LIMITS,
	TV_PACK_MAX_MB,
	TV_PACK_ZIP_TYPES,
} from "../../../../convex/lib/tv/constants.ts";
import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import {
	createActionError,
	type ActionErrorState,
} from "../../../shared/createActionError.ts";
import { downloadBlob, downloadHref } from "../../../shared/downloadBlob.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { postFile } from "../../../shared/postFile.ts";

import styles from "./PackActions.module.scss";
import type { PackState } from "./slideTypes.ts";

const IMPORT_FAILED = "Could not use that pack. Try again.";
const UPLOAD_FAILED = "Could not upload the pack. Try again.";
const TOO_LARGE = `A pack can be at most ${String(TV_PACK_MAX_MB)} MB.`;
const UPLOADED = "Pack uploaded.";
const NOT_A_ZIP = "Choose a .zip file.";
const ZIP_NAME = /\.zip$/i;
const PACK_NAME = "jfloor-tv-pack.zip";
const ZIP_TYPE = "application/zip";

/**
 * The file to upload, with a content type the server accepts: browsers
 * report an empty or odd type for some .zip files, so those are sent as
 * application/zip. Anything that is not a .zip by name or type is refused.
 */
function asZipUpload(file: File): File | null {
	if (TV_PACK_ZIP_TYPES.has(file.type)) return file;
	if (!ZIP_NAME.test(file.name)) return null;
	return new File([file], file.name, { type: ZIP_TYPE });
}

function fetchBlob(url: string): Promise<Blob> {
	return fetch(url).then((response) =>
		response.ok
			? response.blob()
			: Promise.reject(new Error("download failed"))
	);
}

/** Saves the pack. The file is fetched and saved as a blob; when the browser
 *  will not let the page read it (a cross-origin storage URL without CORS) the
 *  plain link takes over and the browser downloads it itself. */
async function savePack(url: string): Promise<void> {
	try {
		downloadBlob(await fetchBlob(url), PACK_NAME);
	} catch {
		downloadHref(url, PACK_NAME);
	}
}

/** Uploads a pack zip and imports it, showing the problems the server found. */
function createPackUpload(trackResult: ActionErrorState["trackResult"]) {
	const generateUploadUrl = useMutation(api.tv.generateUploadUrl);
	const discardUpload = useMutation(api.tv.discardUpload);
	const importPack = useAction(api.tvPack.importPack);
	const [problems, setProblems] = createSignal<string[]>([]);
	const [isBusy, setBusy] = createSignal(false);
	const [notice, setNotice] = createSignal<string | null>(null);
	const confirm = useConfirm();

	/** The server deletes an upload it imported or found too big, but leaves one it
	 *  refused as not a pack. Discarding is a no-op for a blob already gone or held. */
	async function discard(fileId: Id<"_storage">): Promise<void> {
		// Nobody to tell if the cleanup fails: the import's own refusal is shown.
		await call(discardUpload.mutateAsync({ fileId }), IMPORT_FAILED).match(
			() => null,
			() => null
		);
	}

	async function importUploaded(fileId: Id<"_storage">): Promise<void> {
		const imported = await trackResult(
			call(importPack.mutateAsync({ storageId: fileId }), IMPORT_FAILED)
		);
		if (imported.isOk() && imported.value.ok) {
			setNotice(UPLOADED);
			return;
		}
		if (imported.isOk() && !imported.value.ok)
			setProblems(imported.value.problems);
		await discard(fileId);
	}

	async function upload(chosen: File): Promise<void> {
		setProblems([]);
		setNotice(null);
		if (chosen.size > TV_PACK_LIMITS.packMaxBytes) {
			setProblems([TOO_LARGE]);
			return;
		}
		const file = asZipUpload(chosen);
		if (file === null) {
			setProblems([NOT_A_ZIP]);
			return;
		}
		// The pack replaces every manual slide and file, so it is asked first
		// (as deleting one slide is). Nothing is uploaded until the answer.
		const isConfirmed = await confirm({
			title: `Replace the TV's slides with ${chosen.name}?`,
			message:
				"Every slide and file you added by hand is replaced by the pack. Slides from events are kept.",
			confirmLabel: "Replace",
			tone: "danger",
		});
		if (!isConfirmed) return;
		setBusy(true);
		const uploaded = await trackResult(
			call(generateUploadUrl.mutateAsync({}), UPLOAD_FAILED)
				.andThen((url) => postFile(url, file))
				// One message for either step: this is a pack, not an image.
				.mapErr((failure) => ({ ...failure, message: UPLOAD_FAILED }))
		);
		if (uploaded.isOk()) await importUploaded(uploaded.value);
		setBusy(false);
	}

	return { problems, isBusy, notice, upload };
}

/** Why the download is off, or null when it can go. A pack behind the config
 *  can still be downloaded (it is the last one built). */
function downloadReason(state: PackState | undefined): string {
	if (state === undefined) return "Checking for the pack";
	return state.packUrl === null ? "There is no pack to download yet" : "";
}

/** "Upload pack (.zip)" replaces the manual slides and files; "Download pack" saves the built one. */
export function PackActions(props: {
	/** The pack state TvTab reads once. */
	state: Accessor<PackState | undefined>;
}): JSX.Element {
	const { error, trackResult } = createActionError();
	const { problems, isBusy, notice, upload } = createPackUpload(trackResult);
	let input: HTMLInputElement | undefined;

	function isAwaitingMigration(): boolean {
		return props.state()?.isAwaitingMigration === true;
	}

	function isPackBehind(): boolean {
		const current = props.state();
		return (
			current?.packUrl !== null &&
			current !== undefined &&
			current.packVersion !== current.version
		);
	}

	function download(): void {
		const url = props.state()?.packUrl;
		if (url) void savePack(url);
	}

	return (
		<section class={styles.pack}>
			<input
				ref={input}
				class={styles.fileInput}
				type="file"
				accept=".zip,application/zip"
				aria-label="Pack file"
				onChange={(event) => {
					const chosen = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (chosen) void upload(chosen);
				}}
			/>
			<Button
				variant="secondary"
				disabled={isBusy() || isAwaitingMigration()}
				disabledReason={
					isBusy() ? "Uploading the pack" : TV_MIGRATING_MESSAGE
				}
				onClick={() => {
					input?.click();
				}}
			>
				{isBusy() ? "Uploading..." : "Upload pack (.zip)"}
			</Button>
			<Button
				variant="secondary"
				disabled={downloadReason(props.state()) !== ""}
				disabledReason={downloadReason(props.state())}
				onClick={download}
			>
				Download pack
			</Button>
			<Show when={isPackBehind()}>
				<p class={styles.note}>
					This is the last pack built. It may not have your latest
					changes yet.
				</p>
			</Show>
			<Show when={notice()}>
				{(message) => (
					<p role="status" class={styles.note}>
						{message()}
					</p>
				)}
			</Show>
			<Show when={problems().length > 0}>
				<ul class={styles.problems} aria-label="Problems in the pack">
					<For each={problems()}>
						{(problem) => <li>{problem}</li>}
					</For>
				</ul>
			</Show>
			<InlineError message={error()} />
		</section>
	);
}
