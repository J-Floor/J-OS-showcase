import {
	Button,
	EmptyState,
	Input,
	NumberInput,
	Segment,
	Sheet,
	TextArea,
} from "@j-os/design-system";
import { createMemo, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import {
	TV_IMAGE_ACCEPT,
	TV_LIMITS,
} from "../../../../convex/lib/tv/constants.ts";
import { htmlBytes } from "../../../../convex/lib/tv/htmlBytes.ts";
import { NAME_MAX } from "../../../../convex/lib/validate.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";
import { SheetFooter } from "../../../shared/entity/SheetFooter.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";

import { createSlideForm, type SlideMode } from "./createSlideForm.ts";
import styles from "./SlideSheet.module.scss";
import type { SlideDetail } from "./slideTypes.ts";

const GONE = "This slide is no longer there";
const FILE_ACCEPT = `${TV_IMAGE_ACCEPT},.html,text/html`;

type SlideSheetProps = SheetOpenProps & {
	/** The slide shown, `undefined` for the create form. A slide id, not the
	 *  row: the sheet looks it up live. */
	slideId: string | undefined;
};

function htmlCount(text: string): string {
	return `${htmlBytes(text).toLocaleString("en")} of ${TV_LIMITS.htmlMax.toLocaleString("en")} bytes`;
}

function isMode(value: unknown): value is SlideMode {
	return value === "image" || value === "html";
}

/** The choose-or-drop area. A chosen `.html` file fills the text, an image is
 *  held for upload. */
function FilePicker(props: {
	onPick: (file: File) => void;
	fileName: string | undefined;
}): JSX.Element {
	let input: HTMLInputElement | undefined;
	return (
		<div
			class={styles.drop}
			onDragOver={(event) => {
				event.preventDefault();
			}}
			onDrop={(event) => {
				event.preventDefault();
				const dropped = event.dataTransfer?.files[0];
				if (dropped) props.onPick(dropped);
			}}
		>
			<input
				ref={input}
				class={styles.fileInput}
				type="file"
				accept={FILE_ACCEPT}
				aria-label="Slide file"
				onChange={(event) => {
					const chosen = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (chosen) props.onPick(chosen);
				}}
			/>
			<Button
				variant="secondary"
				onClick={() => {
					input?.click();
				}}
			>
				Choose a file
			</Button>
			<span class={styles.hint}>
				{props.fileName ?? "or drop an image or HTML file here"}
			</span>
		</div>
	);
}

type SlideForm = ReturnType<typeof createSlideForm>;

/** The sheet's fields: the type (new slides only), title, duration, the file
 *  picker and, for HTML, the text. */
function SlideFields(props: { form: SlideForm }): JSX.Element {
	return (
		<div class={styles.form}>
			<Show when={!props.form.isEditing()}>
				<Segment.Root
					aria-label="Slide type"
					orientation="horizontal"
					value={props.form.mode()}
					onValueChange={(details) => {
						if (isMode(details.value))
							props.form.changeMode(details.value);
					}}
				>
					<Segment.Item value="image">Image</Segment.Item>
					<Segment.Item value="html">HTML</Segment.Item>
				</Segment.Root>
			</Show>
			<Input
				label="Title"
				maxLength={NAME_MAX}
				value={props.form.title()}
				onValueChange={(event) => {
					props.form.setTitle(event.currentTarget.value);
				}}
			/>
			<NumberInput
				label="Seconds on screen"
				min={TV_LIMITS.durationMin}
				max={TV_LIMITS.durationMax}
				value={props.form.duration()}
				invalid={props.form.durationError() !== null}
				errorText={props.form.durationError() ?? undefined}
				onValueChange={(details) => {
					props.form.setDuration(details.value);
				}}
			/>
			<FilePicker
				onPick={(file) => {
					void props.form.pickFile(file);
				}}
				fileName={props.form.file()?.name}
			/>
			<Show when={props.form.mode() === "html"}>
				<TextArea
					label="HTML"
					rows={12}
					spellcheck={false}
					invalid={props.form.isHtmlTooLong()}
					helperText={htmlCount(props.form.htmlText())}
					errorText={`Too long: ${htmlCount(props.form.htmlText())}.`}
					value={props.form.htmlText()}
					onInput={props.form.setHtmlText}
				/>
			</Show>
		</div>
	);
}

/** What the sheet is waiting for, or has learned is not coming. */
function createLoading(
	props: SlideSheetProps,
	slide: Accessor<unknown>,
	record: Accessor<SlideDetail | null | undefined>,
	form: SlideForm
) {
	// The backend answers `null` for an id it does not have: a deleted slide,
	// a stale link, a slide another board member removed while this was open.
	function isGone(): boolean {
		return props.slideId !== undefined && record() === null;
	}
	// Loading until the list row AND this slide's own record are here: the
	// record in hand may still be the previous slide's. A gone slide is not
	// loading: nothing more will arrive.
	function isRowLoading(): boolean {
		return (
			props.slideId !== undefined && slide() === undefined && !isGone()
		);
	}
	function isLoading(): boolean {
		return props.slideId === undefined || isGone()
			? false
			: slide() === undefined || record()?._id !== props.slideId;
	}
	function disabledReason(): string {
		if (form.isSaving()) return "Saving the slide";
		if (form.isReadOnly()) return "This slide comes from an event";
		return isGone() ? GONE : "Loading the slide";
	}
	return { isGone, isRowLoading, isLoading, disabledReason };
}

/**
 * One sheet to add a slide or edit one. The draft is local and saved with a
 * button; an existing slide keeps its type (image or HTML). Both kinds are
 * saved as files of the TV pack. Slide HTML is only ever typed into a text
 * field here (its file is read into the field as text) and is shown through
 * the sandboxed player, never inserted into the page. A slide that comes from
 * an event is not editable here.
 */
export function SlideSheet(props: SlideSheetProps): JSX.Element {
	const slides = useQuery(api.tvContent.listConfigSlides, {});
	const slide = createMemo(() =>
		slides.data()?.find((row) => row._id === props.slideId)
	);
	const detail = useQuery(
		api.tvContent.getConfigSlide,
		() => ({ id: props.slideId ?? "" }),
		() => ({
			enabled: props.slideId !== undefined,
			keepPreviousData: false,
		})
	);
	const form = createSlideForm({
		open: () => props.open,
		slideId: () => props.slideId,
		detail: () => detail.data() ?? undefined,
		onSaved: () => {
			props.onOpenChange(false);
		},
	});
	function buttonLabel(): string {
		if (form.isSaving()) return "Saving...";
		return form.isEditing() ? "Save" : "Add slide";
	}
	const { isGone, isRowLoading, isLoading, disabledReason } = createLoading(
		props,
		slide,
		detail.data,
		form
	);

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
		>
			<EntitySheetHeader
				title={slide()?.title ?? (isGone() ? "Slide" : "New slide")}
				loading={isRowLoading()}
			/>
			<Sheet.Body loading={isLoading()}>
				<Show
					when={!isGone()}
					fallback={
						<EmptyState
							title={GONE}
							description="It was removed or renamed. Close this and pick it from the list."
						/>
					}
				>
					<SlideFields form={form} />
				</Show>
			</Sheet.Body>
			<SheetFooter error={form.error()}>
				<Button
					onClick={() => form.save()}
					disabled={
						isLoading() ||
						isGone() ||
						form.isSaving() ||
						form.isReadOnly()
					}
					disabledReason={disabledReason()}
				>
					{buttonLabel()}
				</Button>
			</SheetFooter>
		</Sheet.Root>
	);
}
