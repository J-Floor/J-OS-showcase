import { Button, TextArea } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { createSignal, For, Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import {
	TV_MIGRATING_MESSAGE,
	TV_PACK_LIMITS,
} from "../../../../convex/lib/tv/constants.ts";
import { htmlBytes } from "../../../../convex/lib/tv/htmlBytes.ts";
import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import { InlineError } from "../../../shared/InlineError.tsx";

import styles from "./ConfigXmlEditor.module.scss";
import type { PackState } from "./slideTypes.ts";

const SAVE_FAILED = "Could not save config.xml. Try again.";
const CHANGED_MEANWHILE =
	"The TV config changed since you started editing. Your text is kept below. Load the latest config.xml to continue from it.";
const LOADING = "Loading config.xml";
const STALE_CODE = "TvConfigStale";

/** What a save wrote. It is kept (never cleared) and only shown while the
 *  query still answers with an older version, so the text does not flick
 *  back to the old XML between the save and the query catching up. */
type SavedText = { xml: string; version: number };

/** The saved XML, or what the last save wrote while the query is behind it
 *  (an older version than that save, or no answer yet). */
function shownXml(
	written: SavedText | undefined,
	current: { xml: string; version: number } | undefined
): string {
	const isBehind = written && (current?.version ?? 0) < written.version;
	return isBehind ? written.xml : (current?.xml ?? "");
}

/** The config moved on since the draft was started: a save would be refused. */
function isDraftOutdated(
	draft: string | undefined,
	current: PackState | undefined,
	baseVersion: number | undefined
): boolean {
	return (
		draft !== undefined &&
		current !== undefined &&
		current.version !== baseVersion
	);
}

type Confirm = ReturnType<typeof useConfirm>;

function confirmDiscard(confirm: Confirm): Promise<boolean> {
	return confirm({
		title: "Load the latest config.xml?",
		message: "The text you typed is replaced by it.",
		confirmLabel: "Discard my text",
		tone: "danger",
	});
}

/**
 * The editor's draft. It is local until saved or reset: a refetch never
 * replaces it. A save names the version the draft was started from, so a
 * config changed meanwhile is refused instead of overwritten.
 */
function createXmlDraft(state: Accessor<PackState | undefined>) {
	const confirm = useConfirm();
	const save = useMutation(api.tvContent.saveConfigXml);
	const [draft, setDraft] = createSignal<string>();
	const [baseVersion, setBaseVersion] = createSignal<number>();
	const [saved, setSaved] = createSignal<SavedText>();
	const [problems, setProblems] = createSignal<string[]>([]);
	const [isSaving, setSaving] = createSignal(false);
	const [isRefused, setRefused] = createSignal(false);
	const { error, trackResult, clear } = createActionError();
	function text(): string {
		return draft() ?? shownXml(saved(), state());
	}
	function isOutdated(): boolean {
		return isDraftOutdated(draft(), state(), baseVersion());
	}
	function isStale(): boolean {
		return isRefused() || isOutdated();
	}
	function reset(): void {
		setDraft(undefined);
		setBaseVersion(undefined);
		setProblems([]);
		setRefused(false);
		clear();
	}
	function edit(value: string): void {
		if (draft() === undefined) setBaseVersion(state()?.version);
		setDraft(value);
	}
	/** Drops the draft for the saved XML. Asked first when that would throw
	 *  away edits that differ from what the saved XML says. */
	async function loadLatest(): Promise<void> {
		const typed = draft();
		if (typed !== undefined && typed !== shownXml(saved(), state())) {
			if (!(await confirmDiscard(confirm))) return;
		}
		reset();
	}

	async function submit(): Promise<void> {
		const xml = draft();
		const version = baseVersion();
		if (
			isSaving() ||
			isStale() ||
			xml === undefined ||
			version === undefined
		)
			return;
		setSaving(true);
		setProblems([]);
		const result = await trackResult(
			call(
				save.mutateAsync({ xml, expectedVersion: version }),
				SAVE_FAILED
			)
		);
		setSaving(false);
		if (result.isErr()) {
			if (result.error.code === STALE_CODE) setRefused(true);
			return;
		}
		if (result.value.ok) {
			setSaved({ xml, version: result.value.version });
			reset();
		} else setProblems(result.value.problems);
	}

	return {
		text,
		hasDraft: (): boolean => draft() !== undefined,
		problems,
		error,
		isSaving,
		isOutdated,
		isStale,
		edit,
		reset,
		loadLatest,
		submit,
	};
}

type XmlDraft = ReturnType<typeof createXmlDraft>;

/** The text's size against the cap the server enforces (UTF-8 bytes). */
function xmlSize(text: string): { label: string; isTooBig: boolean } {
	const bytes = htmlBytes(text);
	const max = TV_PACK_LIMITS.configMaxBytes;
	return {
		label: `${bytes.toLocaleString("en")} of ${max.toLocaleString("en")} bytes`,
		isTooBig: bytes > max,
	};
}

function saveReason(form: XmlDraft, isTooBig: boolean): string {
	if (form.isSaving()) return "Saving config.xml";
	if (isTooBig) return "config.xml is too long";
	return form.isStale()
		? "Load the latest config.xml first"
		: "No changes to save";
}

/** Load latest (when the draft is stale), Discard changes and Save. */
function EditorActions(props: {
	form: XmlDraft;
	isTooBig: boolean;
}): JSX.Element {
	return (
		<div class={styles.actions}>
			<Show when={props.form.isStale()}>
				<Button
					variant="secondary"
					onClick={() => void props.form.loadLatest()}
				>
					Load latest
				</Button>
			</Show>
			<Button
				variant="secondary"
				disabled={!props.form.hasDraft()}
				disabledReason="No changes to discard"
				onClick={props.form.reset}
			>
				Discard changes
			</Button>
			<Button
				disabled={
					!props.form.hasDraft() ||
					props.form.isSaving() ||
					props.form.isStale() ||
					props.isTooBig
				}
				disabledReason={saveReason(props.form, props.isTooBig)}
				onClick={() => void props.form.submit()}
			>
				{props.form.isSaving() ? "Saving..." : "Save config.xml"}
			</Button>
		</div>
	);
}

/** The live config.xml editor: the server validates the XML and returns the
 *  problems to fix, line by line where it can. */
export function ConfigXmlEditor(props: {
	/** The pack state TvTab reads once. */
	state: Accessor<PackState | undefined>;
}): JSX.Element {
	const form = createXmlDraft(() => props.state());
	function size(): ReturnType<typeof xmlSize> {
		return xmlSize(form.text());
	}
	function isLoaded(): boolean {
		return props.state() !== undefined;
	}
	return (
		<section class={styles.editor}>
			<TextArea
				label="config.xml"
				rows={14}
				spellcheck={false}
				invalid={form.problems().length > 0 || size().isTooBig}
				helperText={size().label}
				errorText={
					size().isTooBig ? `Too long: ${size().label}.` : undefined
				}
				value={form.text()}
				disabled={
					!isLoaded() || props.state()?.isAwaitingMigration === true
				}
				disabledReason={isLoaded() ? TV_MIGRATING_MESSAGE : LOADING}
				onInput={form.edit}
			/>
			<Show when={form.problems().length > 0}>
				<ul class={styles.problems} aria-label="Problems in config.xml">
					<For each={form.problems()}>
						{(problem) => <li>{problem}</li>}
					</For>
				</ul>
			</Show>
			<InlineError
				message={
					form.error() ??
					(form.isOutdated() ? CHANGED_MEANWHILE : null)
				}
			/>
			<EditorActions form={form} isTooBig={size().isTooBig} />
		</section>
	);
}
