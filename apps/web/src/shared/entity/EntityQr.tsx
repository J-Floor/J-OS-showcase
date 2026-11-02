import { QrCode, useQrCode } from "@ark-ui/solid/qr-code";
import { Button, Icon, IconButton, SwapIconButton } from "@j-os/design-system";
import { createSignal, onMount, Show, type JSX } from "solid-js";

import { createCopyFeedback } from "../createCopyFeedback.ts";
import { downloadHref } from "../downloadBlob.ts";
import { ICONS } from "../icons.ts";
import { toaster } from "../toaster.ts";

import type { EntityQrLink } from "./entityDescriptor.ts";
import styles from "./EntityQr.module.scss";

const QR_DOWNLOAD_FAILED = "Could not download the QR code. Try again.";

/**
 * The QR of `url`, built off-screen for one download and then dropped: zag
 * rasterises the frame SVG it finds in the DOM, so the frame must be mounted
 * and laid out (off-screen, not `display: none`, which measures 0×0). Calls
 * `onDone` once the PNG is saved, or once it failed. A failure has no area of
 * its own (the button sits in a table row), so it is a toast.
 */
function QrDownload(props: EntityQrLink & { onDone: () => void }): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- one QR per mount: the download is for the url it was mounted with
	const qr = useQrCode({ value: props.url });
	onMount(() => {
		void qr()
			.getDataUrl("image/png")
			.then((href) => {
				downloadHref(href, props.fileName);
			})
			// `onDone` still frees the button for another try.
			.catch(() => {
				toaster.create({ type: "error", title: QR_DOWNLOAD_FAILED });
			})
			.finally(props.onDone);
	});
	return (
		<QrCode.RootProvider value={qr}>
			<QrCode.Frame class={styles.offscreenQr} aria-hidden="true">
				<QrCode.Pattern />
			</QrCode.Frame>
		</QrCode.RootProvider>
	);
}

/**
 * Row-action pair: copy link (`SwapIconButton`) + download QR. No ability
 * gate inside — callers wrap in `<Can>`. Ported from `EventRowActions`.
 *
 * The QR is built only when Download QR is pressed. A table renders this in
 * every row, and encoding a QR per row at mount made opening the page stall
 * the main thread for a download that is rarely used.
 */
export function EntityQrActions(props: EntityQrLink): JSX.Element {
	const { copied, copy } = createCopyFeedback(() => props.url);
	const [isDownloading, setDownloading] = createSignal(false);

	return (
		<>
			<SwapIconButton
				tooltipLabel={copied() ? "Copied" : "Copy link"}
				idleIcon={ICONS.link}
				success={copied()}
				onClick={copy}
			/>
			<IconButton
				tooltipLabel="Download QR"
				isLoading={isDownloading()}
				onClick={() => {
					setDownloading(true);
				}}
			>
				{ICONS.qr}
			</IconButton>
			<Show when={isDownloading()}>
				<QrDownload
					url={props.url}
					fileName={props.fileName}
					onDone={() => setDownloading(false)}
				/>
			</Show>
		</>
	);
}

/**
 * Sheet block: rendered QR + Copy link Button + Download button. No ability
 * gate inside — callers wrap in `<Can>`. Ported from the events "QR & link"
 * accordion body.
 */
export function EntityQrBlock(props: EntityQrLink): JSX.Element {
	const { copied, copy } = createCopyFeedback(() => props.url);

	return (
		<QrCode.Root value={props.url} class={styles.qrBlock}>
			<QrCode.Frame class={styles.qr}>
				<QrCode.Pattern />
			</QrCode.Frame>
			<div class={styles.actions}>
				<Button variant="secondary" onClick={copy}>
					<Icon>{copied() ? ICONS.check : ICONS.link}</Icon>{" "}
					{copied() ? "Copied" : "Copy link"}
				</Button>
				<QrCode.DownloadTrigger
					fileName={props.fileName}
					mimeType="image/png"
					asChild={(triggerProps) => (
						<Button
							triggerProps={triggerProps()}
							variant="secondary"
						>
							<Icon>{ICONS.qr}</Icon> Download QR
						</Button>
					)}
				/>
			</div>
		</QrCode.Root>
	);
}
