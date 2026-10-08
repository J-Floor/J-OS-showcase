import { useAction } from "convex-solidjs";
import {
	For,
	Show,
	createSignal,
	onCleanup,
	onMount,
	type JSX,
} from "solid-js";

import { api } from "../../../convex/_generated/api";

import { lockHealthSummary, type DoorHealth } from "./lockHealth.ts";
import styles from "./LockHealthCard.module.scss";
import { SpaceCard } from "./SpaceCard.tsx";

const POLL_MS = 60_000;

/**
 * Diagnostics-tab card: how many of the space's smart locks the door provider
 * can actually reach right now, and which ones. Board-only — members no longer
 * see this on Access.
 *
 * An action, not a query, because it asks the provider — so it cannot be
 * subscribed. Instead it checks on mount and again every minute while the page
 * is visible, plus straight away when the page comes back into view. The
 * action's server-side cache keeps that from becoming one provider call per
 * viewer per minute.
 */
export function LockHealthCard(): JSX.Element {
	const health = useAction(api.doorHealth.doorHealth);
	const [reading, setReading] = createSignal<DoorHealth>();
	const [failed, setFailed] = createSignal(false);

	async function check() {
		try {
			setReading(await health.mutateAsync({}));
			setFailed(false);
		} catch {
			setFailed(true);
		}
	}

	function onVisibilityChange() {
		if (document.visibilityState === "visible") void check();
	}

	onMount(() => {
		void check();
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") void check();
		}, POLL_MS);
		document.addEventListener("visibilitychange", onVisibilityChange);
		onCleanup(() => {
			clearInterval(timer);
			document.removeEventListener(
				"visibilitychange",
				onVisibilityChange
			);
		});
	});

	function summary() {
		const data = reading();
		return data && !failed() ? lockHealthSummary(data) : undefined;
	}
	// While loading, and if the check fails, there is no summary — fall back to a
	// tone the card can still colour by.
	function tone(): "neutral" | "error" {
		return summary()?.tone ?? (failed() ? "error" : "neutral");
	}

	return (
		<SpaceCard
			title="Doors"
			helpText="Whether the space's smart locks are reachable right now."
			note={
				<p class={styles.note} data-tone={tone()}>
					<Show
						when={summary()}
						fallback={
							failed()
								? "Couldn't reach the locks."
								: "Checking door status…"
						}
					>
						{(s) => s().detail}
					</Show>
				</p>
			}
		>
			<div class={styles.stack}>
				<div class={styles.value} data-tone={tone()}>
					<Show
						when={summary()}
						fallback={
							<span class={styles.num}>
								{failed() ? "?" : "…"}
							</span>
						}
					>
						{(s) => (
							<>
								<span class={styles.num}>{s().value}</span>
								<span class={styles.label}>doors online</span>
							</>
						)}
					</Show>
				</div>
				<Show when={summary() && reading()?.locks}>
					{(locks) => (
						<ul class={styles.locks}>
							<For each={locks()}>
								{(lock) => (
									<li
										class={styles.lock}
										data-online={
											lock.online ? "true" : "false"
										}
									>
										{lock.name}
										{lock.online ? " online" : " offline"}
									</li>
								)}
							</For>
						</ul>
					)}
				</Show>
			</div>
		</SpaceCard>
	);
}
