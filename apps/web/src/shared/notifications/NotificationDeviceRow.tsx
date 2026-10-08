import { Switch } from "@j-os/design-system";
import { type JSX, Show } from "solid-js";

import type { PushSupport } from "../../lib/push.ts";

import styles from "./NotificationDeviceRow.module.scss";
import type { PushDevice } from "./usePushDevice.ts";

const EMAIL_STILL_REACHES =
	"Notifications with an email version still reach you by email.";

type BlockedSupport = Exclude<PushSupport, "default" | "granted">;

const BLOCKED_COPY: Record<BlockedSupport, string> = {
	unsupported: `This browser cannot show notifications. ${EMAIL_STILL_REACHES}`,
	ios: `Push notifications aren't available on iPhone or iPad. ${EMAIL_STILL_REACHES}`,
	denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.",
};

const NOT_CONFIGURED_COPY = "Push notifications aren't set up yet.";

const OFF_COPY = "Off. Turn on to get notifications here as well as by email.";

const ON_COPY = "On.";

/**
 * The drawer's always-visible device row: this device's push state, owned by
 * the drawer's `usePushDevice`, shown as one switch.
 */
export function NotificationDeviceRow(props: {
	device: PushDevice;
}): JSX.Element {
	function copy(): string {
		if (!props.device.configured()) return NOT_CONFIGURED_COPY;
		const current = props.device.support();
		if (current === "default" || current === "granted")
			return props.device.pushOn() ? ON_COPY : OFF_COPY;
		return BLOCKED_COPY[current];
	}

	return (
		<div class={styles.row}>
			<Switch
				label="Push notifications on this device"
				description={copy()}
				checked={props.device.pushOn()}
				disabled={!props.device.canToggle() || props.device.busy()}
				onCheckedChange={(details) => {
					void (details.checked
						? props.device.enable()
						: props.device.disable());
				}}
			/>
			<Show when={props.device.error()}>
				{(message) => <p class={styles.error}>{message()}</p>}
			</Show>
		</div>
	);
}
