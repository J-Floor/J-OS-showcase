import { Dialog } from "@j-os/design-system";
import { createEffect, createSignal, onCleanup, type JSX } from "solid-js";

import type { OpenProps } from "../../../shared/types.ts";

import { startQrScan, type QrScanCode } from "./qrScan.ts";
import styles from "./QrScannerDialog.module.scss";

const STATUS_COPY: Record<QrScanCode, string> = {
	unsupported: "This browser can't scan QR codes.",
	permission:
		"Camera access is needed to scan. Allow it in the browser and try again.",
	unavailable: "No camera is available on this device.",
};

const HINT = "Point the camera at the QR code";

type QrScannerDialogProps = OpenProps & {
	onDetect: (raw: string) => void;
	error?: string;
};

type ScannerProps = Pick<QrScannerDialogProps, "open" | "onDetect" | "error">;

/** Runs the camera scan while the dialog is open, and says what it is doing:
 *  the hint, a provided error, or why the camera could not start. */
function createQrScanStatus(props: ScannerProps) {
	const [videoElement, setVideoElement] = createSignal<HTMLVideoElement>();
	const [scanError, setScanError] = createSignal<QrScanCode>();

	createEffect(() => {
		if (!props.open) return;
		const video = videoElement();
		if (video === undefined) return;
		const onDetect = props.onDetect;
		setScanError(undefined);
		const ac = new AbortController();
		void startQrScan(video, onDetect, ac.signal).then((result) => {
			if (result.isErr()) setScanError(result.error.code);
		});
		onCleanup(() => {
			ac.abort();
		});
	});

	function statusText(): string {
		if (props.error !== undefined && props.error !== "") return props.error;
		const code = scanError();
		return code === undefined ? HINT : STATUS_COPY[code];
	}

	function statusTone(): "error" | undefined {
		if (props.error !== undefined && props.error !== "") return "error";
		return scanError() === undefined ? undefined : "error";
	}

	return { setVideoElement, statusText, statusTone };
}

/** The status and the camera preview. Built for each opening (as every
 *  dialog's content is), so each one starts its own scan with a fresh
 *  status; the scan stops as the dialog closes. */
function Scanner(props: ScannerProps): JSX.Element {
	const { setVideoElement, statusText, statusTone } =
		createQrScanStatus(props);
	return (
		<>
			<Dialog.Header>
				<Dialog.Title>Scan asset tag</Dialog.Title>
				<Dialog.Description>
					<span class={styles.status} data-status={statusTone()}>
						{statusText()}
					</span>
				</Dialog.Description>
			</Dialog.Header>
			<video
				ref={setVideoElement}
				class={styles.video}
				playsinline
				muted
				autoplay
				aria-label="Camera preview"
			/>
		</>
	);
}

export function QrScannerDialog(props: QrScannerDialogProps): JSX.Element {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Scanner
					open={props.open}
					onDetect={props.onDetect}
					error={props.error}
				/>
			</Dialog.Content>
		</Dialog.Root>
	);
}
