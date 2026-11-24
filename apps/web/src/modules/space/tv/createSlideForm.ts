import { useMutation } from "convex-solidjs";
import { err, errAsync, ResultAsync, type Result } from "neverthrow";
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
import { tvMessages } from "../../../../convex/lib/errors/tv.ts";
import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";
import { htmlBytes } from "../../../../convex/lib/tv/htmlBytes.ts";
import { call, type ClientError } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { postFile, UPLOAD_FAILED } from "../../../shared/postFile.ts";

import { durationProblem } from "./durationProblem.ts";
import { readSlideFile } from "./readSlideFile.ts";
import type { SlideDetail } from "./slideTypes.ts";

export type SlideMode = "image" | "html";

const SAVE_FAILED = "Could not save the slide. Try again.";
const HTML_LOAD_FAILED = "Could not load the slide's HTML. Try again.";

const LOAD_ERROR: ClientError = {
	code: "Unknown",
	message: HTML_LOAD_FAILED,
};

/** The slide's HTML file, read as text. */
function loadHtml(url: string): ResultAsync<string, ClientError> {
	return ResultAsync.fromPromise(fetch(url), () => LOAD_ERROR).andThen(
		(response) =>
			response.ok
				? ResultAsync.fromPromise(response.text(), () => LOAD_ERROR)
				: errAsync(LOAD_ERROR)
	);
}

/** The server looked at the save and said no; an "Unknown" failure (network,
 *  an answer that never came) leaves the upload alone, as the save may have
 *  gone through. */
function isRefusal(error: ClientError): boolean {
	return error.code !== "Unknown";
}

type SaveResult = Result<unknown, ClientError>;

type FormOptions = {
	open: Accessor<boolean>;
	/** The slide being edited, `undefined` for a new one. */
	slideId: Accessor<string | undefined>;
	/** The open slide's full record, once it has arrived (`undefined` while
	 *  loading, and for an id the config does not have). */
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

/** Reads an HTML slide's file into the draft. Nothing is filled if another
 *  slide opened meanwhile, or the user already typed or picked a file. */
function fillFromFile(
	forId: string,
	url: string,
	options: FormOptions,
	draft: {
		htmlText: Accessor<string>;
		setHtmlText: (text: string) => void;
		setLoadedHtml: (text: string) => void;
		setPickError: (message: string | null) => void;
	}
): void {
	void loadHtml(url).match(
		(text) => {
			untrack(() => {
				if (options.slideId() !== forId || draft.htmlText() !== "")
					return;
				draft.setLoadedHtml(text);
				draft.setHtmlText(text);
			});
		},
		(failure) => {
			if (untrack(options.slideId) === forId)
				draft.setPickError(failure.message);
		}
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
	// The text the slide's file held when it was loaded: what "changed" is
	// measured against, so a title-only edit uploads nothing.
	const [loadedHtml, setLoadedHtml] = createSignal<string>();
	const [file, setFile] = createSignal<File>();
	const [pickError, setPickError] = createSignal<string | null>(null);

	function blank(): void {
		setMode("image");
		setTitle("");
		setDuration(String(TV_LIMITS.durationDefault));
		setHtmlText("");
		setLoadedHtml(undefined);
		setFile(undefined);
	}
	function fill(detail: SlideDetail): void {
		blank();
		setMode(detail.kind);
		setTitle(detail.title);
		setDuration(String(detail.durationSec));
		if (detail.kind !== "html" || detail.url === null) return;
		fillFromFile(detail._id, detail.url, options, {
			htmlText,
			setHtmlText,
			setLoadedHtml,
			setPickError,
		});
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
		htmlChanged: (): boolean => htmlText() !== (loadedHtml() ?? ""),
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

/** Uploads a file, then saves a slide that points at it. A save the server
 *  refuses deletes the upload, so a refusal leaves no orphaned blob. A save
 *  that merely failed to get through keeps it, and nothing references it
 *  then: each Save uploads the file again, so a retry does not reuse it and
 *  the first upload stays behind as an unreferenced blob. */
function createFileSave(trackResult: Track) {
	const generateUploadUrl = useMutation(api.tv.generateUploadUrl);
	const discardUpload = useMutation(api.tv.discardUpload);

	function upload(file: File): ResultAsync<Id<"_storage">, ClientError> {
		return call(generateUploadUrl.mutateAsync({}), UPLOAD_FAILED).andThen(
			(url) => postFile(url, file)
		);
	}

	return async function saveWithFile(
		file: File,
		save: (fileId: Id<"_storage">) => ResultAsync<unknown, ClientError>
	): Promise<SaveResult> {
		const uploaded = await trackResult(upload(file));
		if (uploaded.isErr()) return uploaded;
		const fileId = uploaded.value;
		const saved = await trackResult(save(fileId));
		// Nobody to tell if the cleanup fails: the save's own refusal is what
		// the sheet shows.
		if (saved.isErr() && isRefusal(saved.error))
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

/** The HTML text as the file the pack holds. */
function htmlFile(text: string): File {
	return new File([text], "slide.html", { type: "text/html" });
}

/** The file an edit uploads: a changed HTML text, or a newly chosen image.
 *  Nothing when only the title or duration changed. */
function changedFile(draft: SlideDraft): File | undefined {
	if (draft.mode() === "image") return draft.file();
	return draft.htmlChanged() ? htmlFile(draft.htmlText()) : undefined;
}

/** The writes of a draft: a new slide, or an edit of an existing one. */
function createSlideWrites(draft: SlideDraft, trackResult: Track) {
	const addSlide = useMutation(api.tvContent.addConfigSlide);
	const updateSlide = useMutation(api.tvContent.updateConfigSlide);
	const saveWithFile = createFileSave(trackResult);

	function saveNew(): Promise<SaveResult> {
		const file =
			draft.mode() === "html" ? htmlFile(draft.htmlText()) : draft.file();
		if (file === undefined) {
			draft.setPickError("Choose an image first.");
			return Promise.resolve(err({ code: "Unknown", message: "" }));
		}
		const title = draft.title();
		const durationSec = Number(draft.duration());
		const kind = draft.mode();
		return saveWithFile(file, (fileId) =>
			call(
				addSlide.mutateAsync({ title, kind, fileId, durationSec }),
				SAVE_FAILED
			)
		);
	}

	function saveExisting(id: string): Promise<SaveResult> {
		const base = {
			id,
			title: draft.title(),
			durationSec: Number(draft.duration()),
		};
		const file = changedFile(draft);
		return file === undefined
			? trackResult(call(updateSlide.mutateAsync(base), SAVE_FAILED))
			: saveWithFile(file, (fileId) =>
					call(
						updateSlide.mutateAsync({ ...base, fileId }),
						SAVE_FAILED
					)
				);
	}

	return { saveNew, saveExisting };
}

/** An edit waits for its own record (until then the draft is not it), and an
 *  event's slide is never saved from here. */
function canSave(options: FormOptions): boolean {
	const id = options.slideId();
	if (id === undefined) return true;
	const detail = options.detail();
	return detail?._id === id && !detail.fromEvent;
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
		if (!canSave(options)) return;
		draft.setPickError(null);
		clear();
		if (draft.durationError() !== null || draft.isHtmlTooLong()) return;
		const started = generation;
		setSaving(true);
		const result = await (id === undefined
			? writes.saveNew()
			: writes.saveExisting(id));
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
	function isEventSlide(): boolean {
		const detail = options.detail();
		return detail?._id === options.slideId() && detail?.fromEvent === true;
	}
	return {
		...draft,
		isEditing: (): boolean => options.slideId() !== undefined,
		/** An event's slide: the event owns it, the sheet cannot save it. */
		isReadOnly: isEventSlide,
		save: saving.save,
		isSaving: saving.isSaving,
		error: (): string | null =>
			(isEventSlide() ? tvMessages.TvEventSlideLocked : null) ??
			draft.pickError() ??
			saving.error(),
	};
}
