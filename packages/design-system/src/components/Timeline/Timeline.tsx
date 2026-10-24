import { createMemo, createSignal, For, Show, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { createSlotPart } from "../../utils/presence.tsx";
import { Button } from "../Button/Button.tsx";
import { EmptyState } from "../EmptyState/EmptyState.tsx";
import { Icon, type IconProps } from "../Icon/Icon.tsx";

import styles from "./Timeline.module.scss";

export type TimelineEntry = {
	id: string;
	/** Epoch ms. */
	at: number;
	/** Material Symbols ligature. Default `ICONS.event`. */
	icon?: IconProps["children"];
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
	/** Parts: a `Timeline.Empty` replaces the default empty state. */
	children?: JSX.Element;
};

/** `Timeline.Empty`: shown in place of the default empty state when there
 *  are no entries. */
const emptyPart = createSlotPart("Timeline", "Empty", "Timeline");

const DEFAULT_ICON = ICONS.event;

function formatDate(at: number): string {
	return new Date(at).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** One event on the rail. */
function EntryRow(props: { entry: TimelineEntry }): JSX.Element {
	return (
		<li
			class={styles.entry}
			classList={{ [styles.muted]: props.entry.muted }}
		>
			<span class={styles.rail}>
				<Icon>{props.entry.icon ?? DEFAULT_ICON}</Icon>
			</span>
			<span class={styles.body}>
				<span class={styles.title}>{props.entry.title}</span>
				<Show when={props.entry.detail}>
					<span class={styles.detail}>{props.entry.detail}</span>
				</Show>
				<span class={styles.meta}>
					{formatDate(props.entry.at)}
					<Show when={props.entry.actor}>
						{(actor) => <> · {actor()}</>}
					</Show>
				</span>
			</span>
		</li>
	);
}

/** One toggle per kind, each with its entry count. */
function KindFilters(props: {
	kinds: { kind: string; count: number }[];
	isOn: (kind: string) => boolean;
	onToggle: (kind: string) => void;
}): JSX.Element {
	return (
		<div class={styles.filters}>
			<For each={props.kinds}>
				{(group) => (
					<button
						type="button"
						class={styles.toggle}
						aria-pressed={props.isOn(group.kind)}
						classList={{
							[styles.toggleOff]: !props.isOn(group.kind),
						}}
						onClick={() => {
							props.onToggle(group.kind);
						}}
					>
						{group.kind} ({group.count})
					</button>
				)}
			</For>
		</div>
	);
}

/**
 * Vertical history rail: newest first, one row per event, filtered by kind.
 *
 * The filter is per KIND, not one "show muted entries" boolean, so a reader
 * can look at one kind of event alone as well as hide the noisy ones.
 * `collapseMuted` decides only the initial state.
 *
 * With no entries it shows an `EmptyState`, or a `Timeline.Empty` child
 * when there is one. With entries that the filters hide, it says so and
 * offers to clear the filters.
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
		const set = new Set(props.entries.map((entry) => entry.kind));
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

	function clearFilters(): void {
		setOverrides(
			Object.fromEntries(kinds().map((group) => [group.kind, true]))
		);
	}

	const visible = createMemo(() =>
		[...props.entries]
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => b.at - a.at)
			.filter((entry) => on(entry.kind))
	);

	return (
		<emptyPart.Scope>
			{props.children}
			<div class={styles.timeline}>
				{/* One kind is not a filter, it is a label. */}
				<Show when={kinds().length > 1}>
					<KindFilters kinds={kinds()} isOn={on} onToggle={toggle} />
				</Show>
				<Show when={props.entries.length === 0}>
					<emptyPart.Slot fallback={<EmptyState />} />
				</Show>
				<Show when={props.entries.length > 0 && visible().length === 0}>
					<EmptyState icon={ICONS.noMatches} title="No matches">
						<Button variant="secondary" onClick={clearFilters}>
							Clear filters
						</Button>
					</EmptyState>
				</Show>
				<Show when={visible().length > 0}>
					<ul class={styles.list}>
						<For each={visible()}>
							{(entry) => <EntryRow entry={entry} />}
						</For>
					</ul>
				</Show>
			</div>
		</emptyPart.Scope>
	);
}

Timeline.Empty = emptyPart.Part;
