import { useMutation } from "convex-solidjs";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import {
	createEffect,
	createMemo,
	createSignal,
	on,
	untrack,
	type Accessor,
} from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";
import { htmlBytes } from "../../../../convex/lib/tv/htmlBytes.ts";
import { call, type ClientError } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";

import { durationProblem } from "./durationProblem.ts";
import { readSlideFile } from "./readSlideFile.ts";
import type { SlideDetail } from "./slideTypes.ts";

export type SlideMode = "image" | "html";

const SAVE_FAILED = "Could not save the slide. Try again.";
const UPLOAD_FAILED = "Could not upload the image. Try again.";
const UPLOAD_ERROR: ClientError = { code: "Unknown", message: UPLOAD_FAILED };

type SaveResult = Result<unknown, ClientError>;

function isStorageReply(body: unknown): body is { storageId: string } {
	return (
		typeof body === "object" &&
		body !== null &&
		"storageId" in body &&
		typeof body.storageId === "string"
	);
}

/** POSTs the file to a one-shot upload URL and returns the blob's id. */
function postFile(
	url: string,
	file: File
): ResultAsync<Id<"_storage">, ClientError> {
	return ResultAsync.fromPromise(
		fetch(url, {
			method: "POST",
			headers: { "Content-Type": file.type },
			body: file,
		}),
		() => UPLOAD_ERROR
	)
		.andThen((response) =>
			response.ok
				? ResultAsync.fromPromise(
						response.json() as Promise<unknown>,
						() => UPLOAD_ERROR
					)
				: errAsync(UPLOAD_ERROR)
		)
		.andThen((body) =>
			isStorageReply(body)
				? ok(body.storageId as Id<"_storage">)
				: err(UPLOAD_ERROR)
		);
}

type FormOptions = {
	open: Accessor<boolean>;
	/** The slide being edited, `undefined` for a new one. */
	slideId: Accessor<string | undefined>;
	/** The open slide's full record, once it has arrived. */
	detail: Accessor<SlideDetail | undefined>;
	/** Runs after a slide was saved. */
	onSaved: () => void;
};

/** Fills the draft when the sheet opens: blank for a new slide, from the
 *  slide's record once it is here. The record's id is a memo, so a refetch of
 *  the same slide (a new record, the same id) does not re-run the fill. */
function fillOnOpen(
	options: FormOptions,
	draft: {
		blank: () => void;
		fill: (detail: SlideDetail) => void;
		setPickError: (message: string | null) => void;
	}
): void {
	const loadedId = createMemo(() => options.detail()?._id);
	createEffect(
		on([options.open, options.slideId, loadedId], ([isOpen, id]) => {
			if (!isOpen) return;
			draft.setPickError(null);
			if (id === undefined) {
				draft.blank();
				return;
			}
			const detail = untrack(options.detail);
			// Another slide's record (or none yet) must not leave the last
			// slide's values to be edited and saved under this id.
			if (detail?._id === id) draft.fill(detail);
			else draft.blank();
		})
	);
}

/** The draft's fields. It is filled when the sheet opens (blank, or from the
 *  slide once its record is here) and never re-filled by a later refetch of
 *  the same slide, which would wipe what is being typed. */
function createSlideDraft(options: FormOptions) {
	const [mode, setMode] = createSignal<SlideMode>("image");
	const [title, setTitle] = createSignal("");
	const [duration, setDuration] = createSignal(
		String(TV_LIMITS.durationDefault)
	);
	const [htmlText, setHtmlText] = createSignal("");
	const [file, setFile] = createSignal<File>();
	const [pickError, setPickError] = createSignal<string | null>(null);

	function blank(): void {
		setMode("image");
		setTitle("");
		setDuration(String(TV_LIMITS.durationDefault));
		setHtmlText("");
		setFile(undefined);
	}
	function fill(detail: SlideDetail): void {
		setMode(detail.kind);
		setTitle(detail.title);
		setDuration(String(detail.durationSec));
		setHtmlText(detail.htmlText ?? "");
		setFile(undefined);
	}

	fillOnOpen(options, { blank, fill, setPickError });

	/** A chosen or dropped file: an HTML file fills the text, an image is
	 *  held for upload. An existing slide keeps its type. */
	async function pickFile(picked: File): Promise<void> {
		setPickError(null);
		const result = await readSlideFile(picked);
		if (result.kind === "error") {
			setPickError(result.message);
			return;
		}
		if (options.slideId() !== undefined && result.kind !== mode()) {
			setPickError(
				`This slide shows ${mode() === "html" ? "HTML" : "an image"}. Add a new slide to change its type.`
			);
			return;
		}
		if (result.kind === "html") {
			setMode("html");
			setHtmlText(result.htmlText);
			setFile(undefined);
		} else {
			setMode("image");
			setHtmlText("");
			setFile(result.file);
		}
	}

	/** The type chosen on a new slide: what belongs to the other type is
	 *  dropped, so it cannot be saved by mistake. */
	function changeMode(next: SlideMode): void {
		setMode(next);
		if (next === "html") setFile(undefined);
		else setHtmlText("");
	}

	return {
		mode,
		changeMode,
		durationError: (): string | null => durationProblem(duration()),
		isHtmlTooLong: (): boolean =>
			mode() === "html" && htmlBytes(htmlText()) > TV_LIMITS.htmlMax,
		title,
		setTitle,
		duration,
		setDuration,
		htmlText,
		setHtmlText,
		file,
		pickError,
		setPickError,
		pickFile,
	};
}

type SlideDraft = ReturnType<typeof createSlideDraft>;

type Track = <T>(
	action: PromiseLike<Result<T, ClientError>>
) => Promise<Result<T, ClientError>>;

/** Uploads an image, then saves a slide that points at it. A refusal of the
 *  save deletes the upload, so a refusal leaves no orphaned blob. */
function createImageSave(trackResult: Track) {
	const generateUploadUrl = useMutation(api.tv.generateUploadUrl);
	const discardUpload = useMutation(api.tv.discardUpload);

	function upload(image: File): ResultAsync<Id<"_storage">, ClientError> {
		return call(generateUploadUrl.mutateAsync({}), UPLOAD_FAILED).andThen(
			(url) => postFile(url, image)
		);
	}

	return async function saveWithImage(
		image: File,
		save: (fileId: Id<"_storage">) => ResultAsync<unknown, ClientError>
	): Promise<SaveResult> {
		const uploaded = await trackResult(upload(image));
		if (uploaded.isErr()) return uploaded;
		const fileId = uploaded.value;
		const saved = await trackResult(save(fileId));
		// Nobody to tell if the cleanup fails: the save's own refusal is what
		// the sheet shows.
		if (saved.isErr())
			await call(
				discardUpload.mutateAsync({ fileId }),
				SAVE_FAILED
			).match(
				() => null,
				() => null
			);
		return saved;
	};
}

/** The writes of a draft: a new slide, or an edit of an existing one. */
function createSlideWrites(draft: SlideDraft, trackResult: Track) {
	const createSlide = useMutation(api.tv.createSlide);
	const updateSlide = useMutation(api.tv.updateSlide);
	const saveWithImage = createImageSave(trackResult);

	function saveNew(): Promise<SaveResult> {
		const image = draft.file();
		const base = {
			title: draft.title(),
			durationSec: Number(draft.duration()),
		};
		if (draft.mode() === "html")
			return trackResult(
				call(
					createSlide.mutateAsync({
						...base,
						kind: "html",
						htmlText: draft.htmlText(),
					}),
					SAVE_FAILED
				)
			);
		if (image === undefined) {
			draft.setPickError("Choose an image first.");
			return Promise.resolve(err({ code: "Unknown", message: "" }));
		}
		return saveWithImage(image, (fileId) =>
			call(
				createSlide.mutateAsync({ ...base, kind: "image", fileId }),
				SAVE_FAILED
			)
		);
	}

	function saveExisting(id: Id<"tvSlides">): Promise<SaveResult> {
		const base = {
			id,
			title: draft.title(),
			durationSec: Number(draft.duration()),
		};
		const image = draft.file();
		if (draft.mode() === "html")
			return trackResult(
				call(
					updateSlide.mutateAsync({
						...base,
						htmlText: draft.htmlText(),
					}),
					SAVE_FAILED
				)
			);
		if (image === undefined)
			return trackResult(
				call(updateSlide.mutateAsync(base), SAVE_FAILED)
			);
		return saveWithImage(image, (fileId) =>
			call(updateSlide.mutateAsync({ ...base, fileId }), SAVE_FAILED)
		);
	}

	return { saveNew, saveExisting };
}

/** Saves a draft and closes the sheet when it went through. */
function createSlideSave(options: FormOptions, draft: SlideDraft) {
	const [isSaving, setSaving] = createSignal(false);
	const { error, trackResult, clear } = createActionError(options.slideId);
	// Counts openings: an answer that comes back after the sheet was closed
	// or opened for another slide must not close or reset the new one.
	let generation = 0;
	const writes = createSlideWrites(draft, trackResult);
	// Another opening, or another slide, starts without the last refusal.
	createEffect(
		on([options.open, options.slideId], () => {
			generation += 1;
			setSaving(false);
			clear();
		})
	);

	async function save(): Promise<void> {
		if (isSaving()) return;
		const id = options.slideId();
		// An edit waits for its own record: until then the draft is not it.
		if (id !== undefined && options.detail()?._id !== id) return;
		draft.setPickError(null);
		clear();
		if (draft.durationError() !== null || draft.isHtmlTooLong()) return;
		const started = generation;
		setSaving(true);
		const result = await (id === undefined
			? writes.saveNew()
			: writes.saveExisting(id as Id<"tvSlides">));
		if (started !== generation) return;
		setSaving(false);
		if (result.isOk()) options.onSaved();
	}

	return { save, isSaving, error };
}

/** The slide sheet's draft and its save. */
export function createSlideForm(options: FormOptions) {
	const draft = createSlideDraft(options);
	const saving = createSlideSave(options, draft);
	return {
		...draft,
		isEditing: (): boolean => options.slideId() !== undefined,
		save: saving.save,
		isSaving: saving.isSaving,
		error: (): string | null => draft.pickError() ?? saving.error(),
	};
}
