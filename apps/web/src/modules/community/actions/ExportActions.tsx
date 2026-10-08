import { isTypingTarget, SwapIconButton } from "@j-os/design-system";
import { createHotkey } from "@tanstack/solid-hotkeys";
import { type JSX, createSignal, onCleanup } from "solid-js";

import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { useApplications } from "../data/useApplications.ts";
import { useGuests } from "../data/useGuests.ts";
import { useMembers } from "../data/useMembers.ts";

import styles from "./ExportActions.module.scss";
import { buildFullExport, buildLightExport } from "./exportShape.ts";

/** Transient success flag: flips true, auto-reverts after `ms`. */
function useDoneFlag(ms = 1500) {
	const [done, setDone] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(timer);
	});
	function flash() {
		setDone(true);
		clearTimeout(timer);
		timer = setTimeout(() => setDone(false), ms);
	}
	return [done, flash] as const;
}

/**
 * Board-only export of all three rosters as nested JSON, grouped by workflow
 * state (applications), tier (members) and active / expired (guests). Download
 * saves the light export (readable fields only) and copy puts the same on the
 * clipboard; each button briefly swaps its icon to a check on success. A third,
 * dev-only button downloads the full raw rows (including UI status and internal
 * fields) behind a size warning dialog.
 */
export function ExportActions(): JSX.Element {
	const applications = useApplications();
	const members = useMembers();
	const guests = useGuests();

	const [downloaded, flashDownloaded] = useDoneFlag();
	const [copied, flashCopied] = useDoneFlag();
	const [fullDownloaded, flashFullDownloaded] = useDoneFlag();
	const confirm = useConfirm();

	function rosters() {
		return {
			applications: applications.data() ?? [],
			members: members.data() ?? [],
			guests: guests.data() ?? [],
		};
	}

	function downloadFile(json: string, filename: string) {
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function download() {
		downloadFile(buildLightExport(rosters()), "jfloor-export.json");
		flashDownloaded();
	}

	async function copy() {
		await navigator.clipboard.writeText(buildLightExport(rosters()));
		flashCopied();
	}

	async function downloadFull() {
		// Built before the prompt so the size shown is the file written.
		const json = buildFullExport(rosters());
		const kb = Math.max(1, Math.round(new Blob([json]).size / 1024));
		if (
			await confirm({
				title: "Download full JSON?",
				message: `Raw database rows plus the UI status block — about ${kb} KB. Meant for debugging; use the regular download for anything you'll read or share.`,
				confirmLabel: "Download",
			})
		) {
			downloadFile(json, "jfloor-export-full.json");
			flashFullDownloaded();
		}
	}

	// D downloads, C copies — global while the console is on screen, since the
	// export spans all three rosters and does not belong to any one tab. `D` is
	// free now that deny moved to `X`; neither collides with a tab's action keys.
	// `isTypingTarget` guards them so typing into a field or an open overlay never
	// fires an export.
	createHotkey(
		"D",
		(event) => {
			if (event.repeat || isTypingTarget(event.target)) return;
			event.preventDefault();
			download();
		},
		() => ({ preventDefault: false })
	);
	createHotkey(
		"C",
		(event) => {
			if (event.repeat || isTypingTarget(event.target)) return;
			event.preventDefault();
			void copy();
		},
		() => ({ preventDefault: false })
	);

	return (
		<div class={styles.actions}>
			<SwapIconButton
				tooltipLabel="Download JSON"
				idleIcon="download"
				shortcut="D"
				success={downloaded()}
				onClick={download}
			/>
			<SwapIconButton
				tooltipLabel="Copy JSON"
				idleIcon={ICONS.copy}
				shortcut="C"
				success={copied()}
				onClick={() => void copy()}
			/>
			<SwapIconButton
				tooltipLabel="Download full JSON (dev)"
				idleIcon="code_blocks"
				success={fullDownloaded()}
				onClick={() => void downloadFull()}
			/>
		</div>
	);
}
