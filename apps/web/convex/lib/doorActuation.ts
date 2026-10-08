// One app door action, from the request to the door's reaction, as a pure
// state machine: no Convex, no fetch. `doorActions.actuateDoor` starts it,
// the attempt mutations in `doorLog.ts` advance it from the row they store,
// and `TABLE` is the only place that decides what a provider answer, a poll
// reading or the timeout does to an attempt.
import type { Infer } from "convex/values";

import type { doorActuation } from "../schema.ts";

import type { DoorAction, DoorPosition } from "./doorProvider.ts";
import type { AssertEqual } from "./typeAssert.ts";

export const CONFIRM_POLL_MS = 500;
export const CONFIRM_WINDOW_MS = 20_000;

/** Where one attempt stands. `sent`: the command is on its way to the
 *  provider. `accepted`: the provider took it; the door has not been seen to
 *  react yet. `actuated`: it has, at `actuatedAt`. `unconfirmed`: it never
 *  did within the window. `offline` / `busy` / `failed`: the provider refused
 *  or failed, so nothing was actuated. */
export type ActuationState =
	| { phase: "sent"; action: DoorAction; requestedAt: number }
	| {
			phase: "accepted";
			action: DoorAction;
			requestedAt: number;
			positionBefore: DoorPosition;
	  }
	| {
			phase: "actuated";
			action: DoorAction;
			requestedAt: number;
			actuatedAt: number;
	  }
	| { phase: "unconfirmed"; action: DoorAction; requestedAt: number }
	| {
			phase: "offline" | "busy" | "failed";
			action: DoorAction;
			requestedAt: number;
	  };

export type ActuationEvent =
	| {
			type: "ACCEPTED";
			positionBefore: DoorPosition;
			momentary: boolean;
			at: number;
	  }
	| { type: "REFUSED"; outcome: "offline" | "busy" | "failed" }
	| { type: "POSITION"; position: DoorPosition; at: number }
	| { type: "TIMEOUT" };

type Phase = ActuationState["phase"];
type EventType = ActuationEvent["type"];
type Rule = (state: ActuationState, event: ActuationEvent) => ActuationState;

export class IllegalActuationTransitionError extends Error {
	readonly phase: Phase;
	readonly event: EventType;

	constructor(phase: Phase, event: EventType) {
		super(`Illegal actuation transition ${phase} -[${event}]->`);
		this.name = "IllegalActuationTransitionError";
		this.phase = phase;
		this.event = event;
	}
}

/** Per action, the reading of the door on its way and the one it ends in. */
const TARGET: Record<DoorAction, { moving: DoorPosition; done: DoorPosition }> =
	{
		unlock: { moving: "unlocking", done: "unlocked" },
		lock: { moving: "locking", done: "locked" },
	};

/**
 * Whether `reading` shows the door reacting to `action`: the motion
 * (`unlocking` / `locking`) or the end position, and not the reading the door
 * already gave before the command. A door that read it before is still
 * showing an earlier command, so it is no information yet, like `offline`,
 * `unknown` or the starting position.
 */
export function reacted(
	action: DoorAction,
	positionBefore: DoorPosition,
	reading: DoorPosition
): boolean {
	const { moving, done } = TARGET[action];
	return (
		reading !== positionBefore && (reading === moving || reading === done)
	);
}

function unchanged(state: ActuationState): ActuationState {
	return state;
}

/**
 * The machine. A missing entry is an illegal transition: a bug, not a state.
 * `actuated` and `unconfirmed` ignore a late poll and the timeout, which is
 * scheduled when the attempt is written and cannot be cancelled; that is what
 * stops a late poll from moving a row backwards.
 */
const TABLE: Record<Phase, Partial<Record<EventType, Rule>>> = {
	sent: {
		ACCEPTED: (state, event) => {
			const { positionBefore, momentary, at } = event as Extract<
				ActuationEvent,
				{ type: "ACCEPTED" }
			>;
			const { action, requestedAt } = state;
			// A door that stays put and already reads the end position has
			// nothing left to do. A momentary door reading it is still in an
			// earlier release, so this command has to show its own.
			return !momentary && positionBefore === TARGET[action].done
				? { phase: "actuated", action, requestedAt, actuatedAt: at }
				: { phase: "accepted", action, requestedAt, positionBefore };
		},
		REFUSED: (state, event) => {
			const { outcome } = event as Extract<
				ActuationEvent,
				{ type: "REFUSED" }
			>;
			return {
				phase: outcome,
				action: state.action,
				requestedAt: state.requestedAt,
			};
		},
	},
	accepted: {
		POSITION: (state, event) => {
			const { action, requestedAt, positionBefore } = state as Extract<
				ActuationState,
				{ phase: "accepted" }
			>;
			const { position, at } = event as Extract<
				ActuationEvent,
				{ type: "POSITION" }
			>;
			return reacted(action, positionBefore, position)
				? { phase: "actuated", action, requestedAt, actuatedAt: at }
				: state;
		},
		TIMEOUT: (state) => ({
			phase: "unconfirmed",
			action: state.action,
			requestedAt: state.requestedAt,
		}),
	},
	actuated: { POSITION: unchanged, TIMEOUT: unchanged },
	unconfirmed: { POSITION: unchanged, TIMEOUT: unchanged },
	offline: {},
	busy: {},
	failed: {},
};

export function transition(
	state: ActuationState,
	event: ActuationEvent
): ActuationState {
	const rule = TABLE[state.phase][event.type];
	if (!rule)
		throw new IllegalActuationTransitionError(state.phase, event.type);
	return rule(state, event);
}

/** The phases a door-log row stores. Each is an `ok` row: the provider
 *  accepted the command. */
export type StoredActuation = "accepted" | "actuated" | "unconfirmed";

/** Compile-time check that this type and the schema's `doorActuation`
 *  validator agree. */
const _storedActuationMatchesSchema: AssertEqual<
	Infer<typeof doorActuation>,
	StoredActuation
> = true;
void _storedActuationMatchesSchema;

/** An attempt as its door-log row stores it. */
export type StoredAttempt = {
	actuation: StoredActuation;
	requestedAt: number;
	actuatedAt?: number;
};

/** What a door-log row stores of `state`, or null for a phase no row stores:
 *  `sent` lasts only until the provider answers, and `doorLog.outcome`
 *  already records the refusals. */
export function storedAttempt(state: ActuationState): StoredAttempt | null {
	switch (state.phase) {
		case "accepted":
		case "unconfirmed":
			return { actuation: state.phase, requestedAt: state.requestedAt };
		case "actuated":
			return {
				actuation: "actuated",
				requestedAt: state.requestedAt,
				actuatedAt: state.actuatedAt,
			};
		case "sent":
		case "offline":
		case "busy":
		case "failed":
			return null;
	}
}

/** The machine state a stored attempt is in. `action` and `positionBefore`
 *  are not stored on the row: the poll chain carries them. */
export function attemptState(
	stored: StoredAttempt,
	action: DoorAction,
	positionBefore: DoorPosition
): ActuationState {
	const { requestedAt } = stored;
	switch (stored.actuation) {
		case "accepted":
			return { phase: "accepted", action, requestedAt, positionBefore };
		case "unconfirmed":
			return { phase: "unconfirmed", action, requestedAt };
		case "actuated":
			if (stored.actuatedAt === undefined)
				throw new Error("An actuated attempt has no actuatedAt.");
			return {
				phase: "actuated",
				action,
				requestedAt,
				actuatedAt: stored.actuatedAt,
			};
	}
}
