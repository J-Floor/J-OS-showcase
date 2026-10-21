import { Button, Dialog } from "@j-os/design-system";
import {
	Show,
	createEffect,
	createSignal,
	onCleanup,
	type JSX,
} from "solid-js";

import { startQrScan, type QrScanCode } from "./qrScan.ts";
import styles from "./QrScannerDialog.module.scss";

const STATUS_COPY: Record<QrScanCode, string> = {
	unsupported: "This browser can't scan QR codes.",
	permission:
		"Camera access is needed to scan. Allow it in the browser and try again.",
	unavailable: "No camera is available on this device.",
};

const HINT = "Point the camera at the QR code";

type ScannerProps = {
	open: boolean;
	onDetect: (raw: string) => void;
	error?: string;
	unknownTag?: string;
};

/** Runs the camera scan while the dialog is open (and not asking about an
 *  unknown tag), and says what it is doing: the hint, a provided error, or
 *  why the camera could not start. */
function createQrScanStatus(props: ScannerProps) {
	const [videoElement, setVideoElement] = createSignal<HTMLVideoElement>();
	const [scanError, setScanError] = createSignal<QrScanCode>();

	createEffect(() => {
		if (!props.open || props.unknownTag !== undefined) return;
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

export function QrScannerDialog(props: {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onDetect: (raw: string) => void;
	error?: string;
	unknownTag?: string;
	onAddUnknown?: () => void;
	onCancelUnknown?: () => void;
}): JSX.Element {
	const { setVideoElement, statusText, statusTone } =
		createQrScanStatus(props);

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(details) => {
				props.onOpenChange(details.open);
			}}
		>
			<Dialog.Content>
				<Show
					when={props.unknownTag}
					fallback={
						<>
							<Dialog.Title>Scan asset tag</Dialog.Title>
							<Dialog.Description>
								<span
									class={styles.status}
									data-status={statusTone()}
								>
									{statusText()}
								</span>
							</Dialog.Description>
							<video
								ref={setVideoElement}
								class={styles.video}
								playsinline
								muted
								autoplay
								aria-label="Camera preview"
							/>
						</>
					}
				>
					{(tag) => (
						<>
							<Dialog.Title>No item for {tag()}</Dialog.Title>
							<Dialog.Description>
								Nothing is registered under this asset tag. Add
								a new item with this tag?
							</Dialog.Description>
							<div class={styles.actions}>
								<Button
									variant="tertiary"
									onClick={() => props.onCancelUnknown?.()}
								>
									Cancel
								</Button>
								<Button onClick={() => props.onAddUnknown?.()}>
									Add item
								</Button>
							</div>
						</>
					)}
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
