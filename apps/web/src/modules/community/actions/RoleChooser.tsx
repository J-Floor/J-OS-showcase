import { DatePicker, Segment } from "@j-os/design-system";
import {
	For,
	Show,
	createMemo,
	createSignal,
	type Accessor,
	type JSX,
} from "solid-js";

import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import type { StateId } from "../../../../convex/lib/lifecycleTypes.ts";
import {
	composeExpiry,
	minExpiryIso,
	SITE_TIMEZONE,
} from "../../../../convex/lib/time.ts";

import styles from "./RoleChooser.module.scss";
import { MOVES, type RoleMove } from "./roleMoves.ts";

/**
 * Pick a destination for one or many people, and turn it into the event that
 * gets there.
 *
 * Lives apart from {@link ChangeRoleDialog} because the drawer offers the same
 * choice inline: unlocking a member or guest used to show every other field as
 * editable while their role — the one thing the board actually changes — stayed
 * frozen text. Two copies of this would drift, and the part that must not drift
 * is `eventFor`: the ORDER of a move's `via` list decides which edge is taken,
 * and taking the generic one where a specific one exists silently skips its
 * effects (see the invariant note on `MOVES`).
 *
 * Owns the choice, the date and the in-flight flag; the caller owns what
 * "confirm" looks like and what happens after. Nothing resets it explicitly:
 * the dialog mounts this only while open, so a cancelled choice dies with the
 * component instead of surviving into the next opening.
 */
export function RoleChooser(props: {
	/** Machine state of every person this applies to. */
	states: StateId[];
	/** Renders the confirm control, given a ready-to-dispatch move. */
	children: (chooser: {
		/** The move the current choice resolves to, or undefined if none. */
		move: Accessor<RoleMove | undefined>;
		saving: Accessor<boolean>;
		commit: () => void;
	}) => JSX.Element;
	onMove: (move: RoleMove) => void | Promise<void>;
	/** Called after a successful move — the dialog closes itself with it. */
	onDone?: () => void;
}): JSX.Element {
	const [choice, setChoice] = createSignal<string | undefined>();
	const [iso, setIso] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);

	/**
	 * The event this row would actually dispatch for the current selection, or
	 * undefined when the row is not offerable. First legal wins, so the specific
	 * event beats the generic `SET_ROLE` wherever both apply.
	 */
	function eventFor(move: (typeof MOVES)[number]) {
		if (props.states.length === 0) return undefined;
		return move.via.find((event) =>
			props.states.every((state) => legalEvents(state).includes(event))
		);
	}

	const available = createMemo(() =>
		MOVES.filter((move) => {
			// Hide a destination every selected row already occupies. SET_ROLE is
			// legal from almost everywhere, so without this it offers "Member" to
			// a member and "Board" to a board member.
			if (
				move.tier !== undefined &&
				props.states.every((state) => state.startsWith(`${move.tier}.`))
			) {
				return false;
			}
			return eventFor(move) !== undefined;
		})
	);

	/** The chosen destination as a dispatchable move, or undefined while the
	 *  choice is missing, illegal, or still waiting on its date. */
	const move = createMemo<RoleMove | undefined>(() => {
		const value = choice();
		if (value === undefined) return undefined;
		const chosen = MOVES.find((m) => m.value === value);
		if (!chosen) return undefined;
		const event = eventFor(chosen);
		if (event === undefined) return undefined;

		if (event === "EXTEND_WINDOW") {
			const until = composeExpiry(iso(), SITE_TIMEZONE)?.utc ?? null;
			// A guest window without a date is what let the old console bypass
			// the machine; the date is required.
			if (until === null) return undefined;
			return { kind: "extendWindow", until };
		}
		if (event === "SET_ROLE") {
			// Every row whose `via` contains SET_ROLE declares a `tier`; without
			// one there is no target to carry, so offer nothing rather than
			// dispatch a role move at nobody.
			return chosen.tier === undefined
				? undefined
				: { kind: "role", tier: chosen.tier };
		}
		// NO CAST. `MOVES` is `as const`, so `event` is a union of the literals
		// in the `via` lists, and the two checks above have removed
		// `EXTEND_WINDOW` and `SET_ROLE`, leaving exactly those `RoleMove`
		// accepts. An assertion would be a no-op, and
		// `@typescript-eslint/no-unnecessary-type-assertion` is an ERROR here.
		return { kind: "event", event };
	});

	function commit(): void {
		const payload = move();
		if (payload === undefined || saving()) return;
		setSaving(true);
		void (async () => {
			try {
				await props.onMove(payload);
				props.onDone?.();
			} finally {
				setSaving(false);
			}
		})();
	}

	return (
		<>
			<Segment.Root
				class={styles.segment}
				value={choice() ?? ""}
				onValueChange={(d) => {
					// Ark's `ValueChangeDetails.value` is `string | null` (it also
					// models "cleared"); `choice` only ever needs undefined for
					// "nothing chosen yet".
					setChoice(d.value ?? undefined);
				}}
			>
				<For each={available()}>
					{(o) => (
						<Segment.Item value={o.value}>{o.label}</Segment.Item>
					)}
				</For>
			</Segment.Root>
			<Show when={choice() === "guest_window"}>
				<DatePicker
					label="Expiry date"
					minIso={minExpiryIso(SITE_TIMEZONE)}
					onValueChange={setIso}
				/>
			</Show>
			{props.children({ move, saving, commit })}
		</>
	);
}
