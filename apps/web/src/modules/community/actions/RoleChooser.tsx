import { DatePicker, Segment } from "@j-os/design-system";
import type { Result } from "neverthrow";
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
import type { ClientError } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { InlineError } from "../../../shared/InlineError.tsx";

import styles from "./RoleChooser.module.scss";
import { MOVES, type RoleMove } from "./roleMoves.ts";

type Via = (typeof MOVES)[number]["via"][number];

/** The first of `move.via` that is legal from every one of `states`. */
function firstLegalEvent(move: (typeof MOVES)[number], states: StateId[]) {
	return states.length === 0
		? undefined
		: move.via.find((event) =>
				states.every((state) => legalEvents(state).includes(event))
			);
}

/** The move a chosen destination dispatches through `event`, or undefined while
 *  it still lacks what that event needs (a date, a target tier). `expiryIso`
 *  is an accessor read only for `EXTEND_WINDOW`, so a caller's memo tracks the
 *  date only while that move is chosen. */
function toRoleMove(
	chosen: (typeof MOVES)[number],
	event: Via,
	expiryIso: Accessor<string | null>
): RoleMove | undefined {
	if (event === "EXTEND_WINDOW") {
		const until = composeExpiry(expiryIso(), SITE_TIMEZONE)?.utc ?? null;
		// A guest window without a date is what let the old console bypass
		// the machine; the date is required.
		return until === null ? undefined : { kind: "extendWindow", until };
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
}

/**
 * Pick a destination for one or many people, and turn it into the event that
 * gets there.
 *
 * Lives apart from {@link ChangeRoleDialog} because the sheet offers the same
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
	onMove: (move: RoleMove) => Promise<Result<unknown, ClientError>>;
	/** Called after a successful move — the dialog closes itself with it. */
	onDone?: () => void;
}): JSX.Element {
	const [choice, setChoice] = createSignal<string | undefined>();
	const [iso, setIso] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	const { error, trackResult } = createActionError();

	/**
	 * The event this row would actually dispatch for the current selection, or
	 * undefined when the row is not offerable. First legal wins, so the specific
	 * event beats the generic `SET_ROLE` wherever both apply.
	 */
	function eventFor(move: (typeof MOVES)[number]) {
		return firstLegalEvent(move, props.states);
	}

	const available = createMemo(() =>
		MOVES.filter((move) => {
			// Hide a destination every selected row already occupies. SET_ROLE is
			// legal from almost everywhere, so without this it offers "Member" to
			// a member and "Board" to a board member.
			return move.tier !== undefined &&
				props.states.every((state) => state.startsWith(`${move.tier}.`))
				? false
				: eventFor(move) !== undefined;
		})
	);

	/** The chosen destination as a dispatchable move, or undefined while the
	 *  choice is missing, illegal, or still waiting on its date. */
	const move = createMemo<RoleMove | undefined>(() => {
		const value = choice();
		if (value === undefined) return;
		const chosen = MOVES.find((candidate) => candidate.value === value);
		if (!chosen) return;
		const event = eventFor(chosen);
		if (event === undefined) return;

		return toRoleMove(chosen, event, iso);
	});

	function commit(): void {
		const payload = move();
		if (payload === undefined || saving()) return;
		setSaving(true);
		void (async () => {
			const result = await trackResult(props.onMove(payload));
			setSaving(false);
			if (result.isOk()) props.onDone?.();
		})();
	}

	return (
		<>
			<Segment.Root
				aria-label="New role"
				class={styles.segment}
				value={choice() ?? ""}
				onValueChange={(details) => {
					// Ark's `ValueChangeDetails.value` is `string | null` (it also
					// models "cleared"); `choice` only ever needs undefined for
					// "nothing chosen yet".
					setChoice(details.value ?? undefined);
				}}
			>
				<For each={available()}>
					{(option) => (
						<Segment.Item value={option.value}>
							{option.label}
						</Segment.Item>
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
			<InlineError message={error()} />
			{props.children({ move, saving, commit })}
		</>
	);
}
