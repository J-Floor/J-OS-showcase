import { QrCode } from "@ark-ui/solid/qr-code";
import { SwapIconButton } from "@j-os/design-system";

import type { Wifi } from "../../../convex/lib/wifi.ts";
import { createActionKeys } from "../../shared/actions/createActionKeys.ts";
import { runAction } from "../../shared/actions/runAction.ts";
import type { ActionDescriptor } from "../../shared/actions/shortcuts.ts";
import { createCopyFeedback } from "../../shared/createCopyFeedback.ts";
import { ICONS } from "../../shared/icons.ts";

import { WIFI_TARGET, type WifiTarget, wifiQrPayload } from "./wifi.ts";
import styles from "./WifiContent.module.scss";

export type WifiContentProps = Wifi;

/**
 * Presentational: a scannable QR code for one Wi-Fi network, plus a masked
 * password with a copy-to-clipboard affordance. No auth/query/context — the
 * caller resolves the credentials (e.g. `WifiCard` via `api.wifi.get`).
 */
export function WifiContent(
	props: WifiContentProps & {
		/** Whether `C` copies the password: only while the card is the one on
		 *  screen. Off unless the caller says so. */
		keysActive?: boolean;
	}
) {
	// The password is never shown on screen (only dots) — copying it straight
	// to the clipboard is how you get it onto a device without revealing it.
	const { copied, copy: copyPassword } = createCopyFeedback(
		() => props.password
	);

	const copy: ActionDescriptor<WifiTarget> = {
		id: "copy-wifi-password",
		label: "Copy password",
		icon: ICONS.copy,
		hotkey: "C",
		can: () => true,
		run: () => {
			copyPassword();
		},
	};
	createActionKeys<WifiTarget>({
		scope: "space-wifi",
		actions: () => [copy],
		target: () => WIFI_TARGET,
		active: () => props.keysActive === true,
	});

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
					<SwapIconButton
						tooltipLabel={copied() ? "Copied" : copy.label}
						idleIcon={copy.icon}
						shortcut={copy.hotkey}
						success={copied()}
						onClick={() => void runAction(copy, WIFI_TARGET)}
					/>
				</div>
			</figure>
		</div>
	);
}
