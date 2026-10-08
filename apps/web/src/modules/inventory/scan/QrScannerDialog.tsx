import { Button, Dialog } from "@j-os/design-system";
import {
	Show,
	createEffect,
	createSignal,
	onCleanup,
	type JSX,
} from "solid-js";

import { QrScanError, startQrScan, type QrScanCode } from "./qrScan.ts";
import styles from "./QrScannerDialog.module.scss";

const STATUS_COPY: Record<QrScanCode, string> = {
	unsupported: "This browser can't scan QR codes.",
	permission:
		"Camera access is needed to scan. Allow it in the browser and try again.",
	unavailable: "No camera is available on this device.",
};

const HINT = "Point the camera at the QR code";

function messageFor(err: unknown): string {
	if (err instanceof QrScanError) return STATUS_COPY[err.code];
	return STATUS_COPY.unavailable;
}

export function QrScannerDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDetect: (raw: string) => void;
	error?: string;
	unknownTag?: string;
	onAddUnknown?: () => void;
	onCancelUnknown?: () => void;
}): JSX.Element {
	const [videoEl, setVideoEl] = createSignal<HTMLVideoElement>();
	const [scanError, setScanError] = createSignal<unknown>();

	createEffect(() => {
		if (!props.open || props.unknownTag !== undefined) return;
		const video = videoEl();
		if (video === undefined) return;
		const onDetect = props.onDetect;
		setScanError(undefined);
		const ac = new AbortController();
		void startQrScan(video, onDetect, ac.signal).catch((err: unknown) => {
			setScanError(err);
		});
		onCleanup(() => {
			ac.abort();
		});
	});

	function statusText(): string {
		if (props.error !== undefined && props.error !== "") return props.error;
		const err = scanError();
		if (err !== undefined) return messageFor(err);
		return HINT;
	}

	function statusTone(): "error" | undefined {
		if (props.error !== undefined && props.error !== "") return "error";
		if (scanError() !== undefined) return "error";
		return undefined;
	}

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(d) => {
				props.onOpenChange(d.open);
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
								ref={setVideoEl}
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
