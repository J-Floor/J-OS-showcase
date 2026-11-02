import { Logo, ProgressBar, Spinner } from "@j-os/design-system";
import { onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { APP_ROOT_ID } from "../lib/constants.ts";
import { isUpdating, updateProgress } from "../lib/pwaUpdates.ts";

import styles from "./UpdatingOverlay.module.scss";

/** Makes the app root inert for as long as it is mounted, so Tab and screen
 * readers cannot reach the controls underneath the overlay. */
function InertRoot() {
	onMount(() => {
		const root = document.getElementById(APP_ROOT_ID);
		if (!root) return;
		root.setAttribute("inert", "");
		onCleanup(() => {
			root.removeAttribute("inert");
		});
	});
	return null;
}

/**
 * Full-screen "Updating the app…" cover, shown while a new build installs
 * over the running one. The reload onto the new build removes it; without
 * it, the old UI followed by a sudden reload looks like a bug. It also blocks
 * pointer and keyboard input, so nothing is edited in the UI that is about to
 * be replaced. It shows the new worker's download progress once the first
 * report arrives, and a spinner until then (or when the browser sends none).
 */
export function UpdatingOverlay() {
	function isReady() {
		const progress = updateProgress();
		return progress !== undefined && progress.done >= progress.total;
	}
	return (
		<Show when={isUpdating()}>
			<InertRoot />
			<Portal>
				<div
					class={styles.overlay}
					role="status"
					aria-label="Updating the app"
				>
					<Logo class={styles.logo} />
					<Show
						when={updateProgress()}
						fallback={
							<span aria-hidden="true">
								<Spinner />
							</span>
						}
					>
						{(progress) => (
							<ProgressBar
								class={styles.progress}
								value={progress().done}
								max={progress().total}
								label="Download progress"
							/>
						)}
					</Show>
					<p class={styles.label}>
						{isReady() ? "Restarting…" : "Updating the app…"}
					</p>
				</div>
			</Portal>
		</Show>
	);
}
