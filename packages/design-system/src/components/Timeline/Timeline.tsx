import { createMemo, createSignal, For, Show, type JSX } from "solid-js";

import { Icon } from "../Icon/Icon.tsx";

import styles from "./Timeline.module.scss";

export type TimelineEntry = {
	id: string;
	/** Epoch ms. */
	at: number;
	/** Material Symbols ligature. Default "radio_button_unchecked". */
	icon?: string;
	title: string;
	detail?: string;
	actor?: string;
	/** Filter bucket. One toggle is rendered per distinct kind. */
	kind: string;
	/** Low-signal entries (e.g. field edits): de-emphasised, and their kind
	 *  starts filtered out. */
	muted?: boolean;
};

export type TimelineProps = {
	entries: TimelineEntry[];
	/** Start with every `muted` kind filtered out. Default true. */
	collapseMuted?: boolean;
};

function formatDate(at: number): string {
	return new Date(at).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Vertical history rail: newest first, one row per event, filtered by kind.
 *
 * The filter is per KIND, not one "show field edits" boolean: the spec's
 * timeline is read to answer "what happened to this person", and that means
 * being able to look at only the door events, or only the emails, as well as
 * hiding the noisy field edits. `collapseMuted` decides only the initial state.
 */
export function Timeline(props: TimelineProps): JSX.Element {
	// Kinds the user has explicitly toggled. Absent = use the default for that
	// kind (muted kinds off, everything else on).
	const [overrides, setOverrides] = createSignal<Record<string, boolean>>({});

	// `func-style` bans statement-level arrow consts, so these are declarations.
	function collapse(): boolean {
		return props.collapseMuted ?? true;
	}

	/** Distinct kinds in first-seen order, with their entry counts. */
	const kinds = createMemo(() => {
		const counts = new Map<string, number>();
		for (const entry of props.entries) {
			counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
		}
		return [...counts].map(([kind, count]) => ({ kind, count }));
	});

	/** A kind is off by default only when every one of its entries is muted. */
	const mutedKinds = createMemo(() => {
		const set = new Set(props.entries.map((e) => e.kind));
		for (const entry of props.entries) {
			if (entry.muted !== true) set.delete(entry.kind);
		}
		return set;
	});

	function on(kind: string): boolean {
		return overrides()[kind] ?? !(collapse() && mutedKinds().has(kind));
	}

	function toggle(kind: string): void {
		setOverrides((prev) => ({ ...prev, [kind]: !on(kind) }));
	}

	const visible = createMemo(() =>
		[...props.entries].sort((a, b) => b.at - a.at).filter((e) => on(e.kind))
	);

	return (
		<div class={styles.timeline}>
			{/* One kind is not a filter, it is a label. */}
			<Show when={kinds().length > 1}>
				<div class={styles.filters}>
					<For each={kinds()}>
						{(k) => (
							<button
								type="button"
								class={styles.toggle}
								aria-pressed={on(k.kind)}
								classList={{ [styles.toggleOff]: !on(k.kind) }}
								onClick={() => {
									toggle(k.kind);
								}}
							>
								{k.kind} ({k.count})
							</button>
						)}
					</For>
				</div>
			</Show>
			<Show
				when={visible().length > 0}
				fallback={<p class={styles.empty}>No history yet.</p>}
			>
				<ul class={styles.list}>
					<For each={visible()}>
						{(entry) => (
							<li
								class={styles.entry}
								classList={{ [styles.muted]: entry.muted }}
							>
								<span class={styles.rail}>
									<Icon>
										{entry.icon ?? "radio_button_unchecked"}
									</Icon>
								</span>
								<span class={styles.body}>
									<span class={styles.title}>
										{entry.title}
									</span>
									<Show when={entry.detail}>
										<span class={styles.detail}>
											{entry.detail}
										</span>
									</Show>
									<span class={styles.meta}>
										{formatDate(entry.at)}
										<Show when={entry.actor}>
											{(actor) => <> · {actor()}</>}
										</Show>
									</span>
								</span>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</div>
	);
}
