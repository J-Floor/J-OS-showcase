import { QrCode } from "@ark-ui/solid/qr-code";
import { IconButton } from "@j-os/design-system";
import { createSignal, onCleanup } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import { wifiQrPayload } from "./wifi.ts";
import styles from "./WifiContent.module.scss";

export type WifiContentProps = {
	ssid: string;
	password: string;
};

/**
 * Presentational: a scannable QR code for one Wi-Fi network, plus a masked
 * password with a copy-to-clipboard affordance. No auth/query/context — the
 * caller resolves the credentials (e.g. `WifiCard` via `api.wifi.get`).
 */
export function WifiContent(props: WifiContentProps) {
	// Flips to true right after a successful copy, so the button briefly shows
	// a tick/"Copied" instead of the copy icon. Cleared on a timer.
	const [copied, setCopied] = createSignal(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(resetTimer);
	});

	function copyPassword(): void {
		// The password is never shown on screen (only dots) — copying it
		// straight to the clipboard is how you get it onto a device without
		// revealing it.
		void navigator.clipboard.writeText(props.password);
		setCopied(true);
		clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			setCopied(false);
		}, 1500);
	}

	return (
		<div class={styles.codes}>
			<figure class={styles.code}>
				<QrCode.Root
					value={wifiQrPayload({
						ssid: props.ssid,
						password: props.password,
					})}
				>
					<QrCode.Frame class={styles.frame}>
						<QrCode.Pattern />
					</QrCode.Frame>
				</QrCode.Root>
				<figcaption class={styles.ssid}>{props.ssid}</figcaption>
				<div class={styles.password}>
					{/* Masked — the characters stay hidden; the button puts
					    them on the clipboard. */}
					<span class={styles.dots} aria-hidden="true">
						••••••••
					</span>
					<IconButton
						tooltipLabel={copied() ? "Copied" : "Copy password"}
						onClick={() => {
							copyPassword();
						}}
					>
						{copied() ? ICONS.check : ICONS.copy}
					</IconButton>
				</div>
			</figure>
		</div>
	);
}
