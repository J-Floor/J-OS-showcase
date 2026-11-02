import { SwapIconButton, useOverlayCovered } from "@j-os/design-system";
import { type JSX, createSignal, onCleanup } from "solid-js";

import { runAction } from "../../../shared/actions/runAction.ts";
import { bindPageKeys } from "../../../shared/actions/sheetActions.tsx";
import {
	PAGE_TARGET,
	type ActionDescriptor,
	type PageTarget,
} from "../../../shared/actions/shortcuts.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { downloadBlob } from "../../../shared/downloadBlob.ts";
import { ICONS } from "../../../shared/icons.ts";
import {
	useApplications,
	useGuests,
	useMembers,
} from "../data/communityData.tsx";

import styles from "./ExportActions.module.scss";
import { buildFullExport, buildLightExport } from "./exportShape.ts";

const BYTES_PER_KILOBYTE = 1024;

function downloadFile(json: string, filename: string) {
	downloadBlob(new Blob([json], { type: "application/json" }), filename);
}

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
 * D downloads, C copies — global while the console is on screen, since the
 * export spans all three rosters and does not belong to any one tab. `D` is
 * free now that deny moved to `X`; neither collides with a tab's action keys.
 * Ignored while typing, and quiet while an overlay (a person's sheet) covers
 * the page.
 */
function useExportHotkeys(actions: {
	download: () => void;
	copy: () => Promise<void>;
}): [ActionDescriptor<PageTarget>, ActionDescriptor<PageTarget>] {
	const keys: [ActionDescriptor<PageTarget>, ActionDescriptor<PageTarget>] = [
		{
			id: "download-json",
			label: "Download JSON",
			icon: ICONS.download,
			hotkey: "D",
			can: () => true,
			run: () => {
				actions.download();
			},
		},
		{
			id: "copy-json",
			label: "Copy JSON",
			icon: ICONS.copy,
			hotkey: "C",
			can: () => true,
			run: async () => {
				await actions.copy();
				return { refused: false };
			},
		},
	];
	bindPageKeys("community-export", keys, () => true);
	return keys;
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
		const kb = Math.max(
			1,
			Math.round(new Blob([json]).size / BYTES_PER_KILOBYTE)
		);
		if (
			!(await confirm({
				title: "Download full JSON?",
				message: `Raw database rows plus the UI status block — about ${kb} KB. Meant for debugging; use the regular download for anything you'll read or share.`,
				confirmLabel: "Download",
			}))
		) {
			return;
		}

		downloadFile(json, "jfloor-export-full.json");
		flashFullDownloaded();
	}

	const [downloadKey, copyKey] = useExportHotkeys({ download, copy });
	// Under a covering sheet the keys are quiet, so the chips hide with them,
	// as on `RowActionButton`.
	const isCovered = useOverlayCovered();

	return (
		<div class={styles.actions}>
			<SwapIconButton
				tooltipLabel={downloadKey.label}
				idleIcon={downloadKey.icon}
				shortcut={isCovered() ? undefined : downloadKey.hotkey}
				success={downloaded()}
				onClick={() => void runAction(downloadKey, PAGE_TARGET)}
			/>
			<SwapIconButton
				tooltipLabel={copyKey.label}
				idleIcon={copyKey.icon}
				shortcut={isCovered() ? undefined : copyKey.hotkey}
				success={copied()}
				onClick={() => void runAction(copyKey, PAGE_TARGET)}
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
