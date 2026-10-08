import { QrCode } from "@ark-ui/solid/qr-code";
import { Button, Icon, IconButton, SwapIconButton } from "@j-os/design-system";
import { createSignal, onCleanup, type JSX } from "solid-js";

import { ICONS } from "../icons.ts";

import styles from "./EntityQr.module.scss";

/**
 * Copy-to-clipboard state shared by {@link EntityQrActions} and
 * {@link EntityQrBlock}: writes `url` on `copy()`, flips `copied()` for 1.5s.
 * A plain helper (not a component) so `onCleanup` still registers against the
 * caller's own owner.
 */
function createCopyLink(url: () => string): {
	copied: () => boolean;
	copy: () => void;
} {
	const [copied, setCopied] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(timer);
	});

	function copy(): void {
		void navigator.clipboard.writeText(url());
		setCopied(true);
		clearTimeout(timer);
		timer = setTimeout(() => {
			setCopied(false);
		}, 1500);
	}

	return { copied, copy };
}

/**
 * Row-action pair: copy link (`SwapIconButton`) + download QR
 * (`QrCode.DownloadTrigger`). No ability gate inside — callers wrap in
 * `<Can>`. Ported from `EventRowActions`.
 *
 * The download rasterises the `QrCode.Frame` SVG it finds in the DOM, so a
 * row with no frame downloads nothing. The frame is rendered off-screen rather
 * than `display: none`, because zag sizes the PNG canvas from the frame's
 * bounding box and a hidden one measures 0×0.
 */
export function EntityQrActions(props: {
	url: string;
	fileName: string;
}): JSX.Element {
	const { copied, copy } = createCopyLink(() => props.url);

	return (
		<>
			<SwapIconButton
				tooltipLabel={copied() ? "Copied" : "Copy link"}
				idleIcon={ICONS.link}
				success={copied()}
				onClick={copy}
			/>
			<QrCode.Root value={props.url}>
				<QrCode.Frame class={styles.offscreenQr} aria-hidden="true">
					<QrCode.Pattern />
				</QrCode.Frame>
				<QrCode.DownloadTrigger
					fileName={props.fileName}
					mimeType="image/png"
					asChild={(triggerProps) => (
						<IconButton
							{...(triggerProps() as object)}
							tooltipLabel="Download QR"
						>
							{ICONS.qr}
						</IconButton>
					)}
				/>
			</QrCode.Root>
		</>
	);
}

/**
 * Drawer block: rendered QR + Copy link Button + Download button. No ability
 * gate inside — callers wrap in `<Can>`. Ported from the events "QR & link"
 * accordion body.
 */
export function EntityQrBlock(props: {
	url: string;
	fileName: string;
}): JSX.Element {
	const { copied, copy } = createCopyLink(() => props.url);

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
							{...(triggerProps() as object)}
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
