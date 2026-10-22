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
import { call } from "../../lib/call.ts";

import { lockHealthSummary, type DoorHealth } from "./lockHealth.ts";
import styles from "./LockHealthCard.module.scss";
import { SpaceCard } from "./SpaceCard.tsx";

const POLL_MS = 60_000;

/**
 * The door provider's health, checked on mount and again every `POLL_MS`
 * while the page is visible, plus straight away when the page comes back
 * into view.
 */
function createLockHealthPolling() {
	const health = useAction(api.doorHealth.doorHealth);
	const [reading, setReading] = createSignal<DoorHealth>();
	/** Why the last check failed, or null when it succeeded. */
	const [failure, setFailure] = createSignal<string | null>(null);

	async function check() {
		const result = await call(
			health.mutateAsync({}),
			"Couldn't reach the locks."
		);
		if (result.isOk()) setReading(result.value);
		setFailure(result.isErr() ? result.error.message : null);
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
	return { reading, failure };
}

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
	const { reading, failure } = createLockHealthPolling();

	function summary() {
		const data = reading();
		return data && !failure() ? lockHealthSummary(data) : undefined;
	}
	// While loading, and if the check fails, there is no summary — fall back to a
	// tone the card can still colour by.
	function tone(): "neutral" | "error" {
		return summary()?.tone ?? (failure() ? "error" : "neutral");
	}

	return (
		<SpaceCard
			title="Doors"
			helpText="Whether the space's smart locks are reachable right now."
			note={
				// The per-lock list below already names each door's state, so
				// the summary line only shows when there is no list.
				<Show when={!(summary() && reading()?.locks)}>
					<p class={styles.note} data-tone={tone()}>
						<Show
							when={summary()}
							fallback={failure() ?? "Checking door status…"}
						>
							{(loadedSummary) => loadedSummary().detail}
						</Show>
					</p>
				</Show>
			}
		>
			<div class={styles.stack}>
				<div class={styles.value} data-tone={tone()}>
					<Show
						when={summary()}
						fallback={
							<span class={styles.num}>
								{failure() ? "?" : "…"}
							</span>
						}
					>
						{(loadedSummary) => (
							<>
								<span class={styles.num}>
									{loadedSummary().value}
								</span>
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
