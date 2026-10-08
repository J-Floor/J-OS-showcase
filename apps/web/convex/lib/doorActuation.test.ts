import { describe, expect, it } from "vitest";

import {
	CONFIRM_POLL_MS,
	CONFIRM_WINDOW_MS,
	IllegalActuationTransitionError,
	attemptState,
	reacted,
	storedAttempt,
	transition,
	type ActuationEvent,
	type ActuationState,
} from "./doorActuation.ts";
import type { DoorPosition } from "./doorProvider.ts";

const T0 = Date.UTC(2026, 9, 8, 12, 0);

const POSITIONS: DoorPosition[] = [
	"locked",
	"unlocked",
	"unlocking",
	"locking",
	"offline",
	"unknown",
];

const SENT: ActuationState = {
	phase: "sent",
	action: "unlock",
	requestedAt: T0,
};
const ACCEPTED: ActuationState = {
	phase: "accepted",
	action: "unlock",
	requestedAt: T0,
	positionBefore: "locked",
};
const ACTUATED: ActuationState = {
	phase: "actuated",
	action: "unlock",
	requestedAt: T0,
	actuatedAt: T0 + 1500,
};
const UNCONFIRMED: ActuationState = {
	phase: "unconfirmed",
	action: "unlock",
	requestedAt: T0,
};
const REFUSED_STATES: ActuationState[] = (
	["offline", "busy", "failed"] as const
).map(
	(phase): ActuationState => ({ phase, action: "unlock", requestedAt: T0 })
);

const EVENTS: Record<ActuationEvent["type"], ActuationEvent> = {
	ACCEPTED: {
		type: "ACCEPTED",
		positionBefore: "locked",
		momentary: false,
		at: T0,
	},
	REFUSED: { type: "REFUSED", outcome: "busy" },
	POSITION: { type: "POSITION", position: "unlocking", at: T0 },
	TIMEOUT: { type: "TIMEOUT" },
};

/** Every (positionBefore, reading) pair for the given readings. */
function pairs(readings: DoorPosition[]): [DoorPosition, DoorPosition][] {
	return POSITIONS.flatMap((before) =>
		readings.map((reading): [DoorPosition, DoorPosition] => [
			before,
			reading,
		])
	);
}

describe("timing", () => {
	it("polls every half second for twenty seconds", () => {
		expect(CONFIRM_POLL_MS).toBe(500);
		expect(CONFIRM_WINDOW_MS).toBe(20_000);
	});
});

describe("reacted", () => {
	it.each(POSITIONS.filter((p) => p !== "unlocking"))(
		"an unlock reading unlocking counts, from %s",
		(before) => {
			expect(reacted("unlock", before, "unlocking")).toBe(true);
		}
	);

	it.each(POSITIONS.filter((p) => p !== "unlocked"))(
		"an unlock reading unlocked counts, from %s",
		(before) => {
			expect(reacted("unlock", before, "unlocked")).toBe(true);
		}
	);

	it.each(["unlocking", "unlocked"] as const)(
		"an unlock reading %s does not count when the door already read it",
		(position) => {
			expect(reacted("unlock", position, position)).toBe(false);
		}
	);

	it.each(pairs(["locked", "locking", "offline", "unknown"]))(
		"an unlock from %s reading %s is no information",
		(before, reading) => {
			expect(reacted("unlock", before, reading)).toBe(false);
		}
	);

	it.each(POSITIONS.filter((p) => p !== "locking"))(
		"a lock reading locking counts, from %s",
		(before) => {
			expect(reacted("lock", before, "locking")).toBe(true);
		}
	);

	it.each(POSITIONS.filter((p) => p !== "locked"))(
		"a lock reading locked counts, from %s",
		(before) => {
			expect(reacted("lock", before, "locked")).toBe(true);
		}
	);

	it.each(["locking", "locked"] as const)(
		"a lock reading %s does not count when the door already read it",
		(position) => {
			expect(reacted("lock", position, position)).toBe(false);
		}
	);

	it.each(pairs(["unlocked", "unlocking", "offline", "unknown"]))(
		"a lock from %s reading %s is no information",
		(before, reading) => {
			expect(reacted("lock", before, reading)).toBe(false);
		}
	);
});

describe("transition", () => {
	it.each([true, false])(
		"sent + ACCEPTED is accepted while the door is not where the action puts it (momentary %s)",
		(momentary) => {
			expect(
				transition(SENT, {
					type: "ACCEPTED",
					positionBefore: "locked",
					momentary,
					at: T0 + 100,
				})
			).toEqual(ACCEPTED);
		}
	);

	it("sent + ACCEPTED is actuated at once when a door that stays put already is where the action puts it", () => {
		expect(
			transition(SENT, {
				type: "ACCEPTED",
				positionBefore: "unlocked",
				momentary: false,
				at: T0 + 100,
			})
		).toEqual({
			phase: "actuated",
			action: "unlock",
			requestedAt: T0,
			actuatedAt: T0 + 100,
		});
	});

	it("a lock accepted by a door already locked is actuated at once", () => {
		expect(
			transition(
				{ phase: "sent", action: "lock", requestedAt: T0 },
				{
					type: "ACCEPTED",
					positionBefore: "locked",
					momentary: false,
					at: T0 + 100,
				}
			)
		).toEqual({
			phase: "actuated",
			action: "lock",
			requestedAt: T0,
			actuatedAt: T0 + 100,
		});
	});

	it.each(["unlocking", "unlocked"] as const)(
		"a momentary door already reading %s stays accepted: that is the last buzz",
		(positionBefore) => {
			expect(
				transition(SENT, {
					type: "ACCEPTED",
					positionBefore,
					momentary: true,
					at: T0 + 100,
				})
			).toEqual({ ...ACCEPTED, positionBefore });
		}
	);

	it("a momentary door mid-buzz reacts only when a reading differs from the one before", () => {
		const midBuzz: ActuationState = {
			...ACCEPTED,
			positionBefore: "unlocking",
		};
		expect(
			transition(midBuzz, {
				type: "POSITION",
				position: "unlocking",
				at: T0 + 500,
			})
		).toBe(midBuzz);
		expect(
			transition(midBuzz, {
				type: "POSITION",
				position: "unlocked",
				at: T0 + 1000,
			})
		).toEqual({
			phase: "actuated",
			action: "unlock",
			requestedAt: T0,
			actuatedAt: T0 + 1000,
		});
	});

	it.each(["offline", "busy", "failed"] as const)(
		"sent + REFUSED %s ends there",
		(outcome) => {
			expect(transition(SENT, { type: "REFUSED", outcome })).toEqual({
				phase: outcome,
				action: "unlock",
				requestedAt: T0,
			});
		}
	);

	it("accepted + a POSITION that reacted is actuated at the reading's time", () => {
		expect(
			transition(ACCEPTED, {
				type: "POSITION",
				position: "unlocking",
				at: T0 + 1500,
			})
		).toEqual(ACTUATED);
	});

	it.each(["locked", "offline", "unknown"] as const)(
		"accepted + a POSITION reading %s stays accepted",
		(position) => {
			expect(
				transition(ACCEPTED, {
					type: "POSITION",
					position,
					at: T0 + 500,
				})
			).toBe(ACCEPTED);
		}
	);

	it("accepted + TIMEOUT is unconfirmed", () => {
		expect(transition(ACCEPTED, EVENTS.TIMEOUT)).toEqual(UNCONFIRMED);
	});

	it.each([
		["actuated", ACTUATED],
		["unconfirmed", UNCONFIRMED],
	] as const)(
		"%s ignores a late POSITION and the TIMEOUT",
		(_phase, state) => {
			expect(
				transition(state, {
					type: "POSITION",
					position: "unlocking",
					at: T0 + 30_000,
				})
			).toBe(state);
			expect(transition(state, EVENTS.TIMEOUT)).toBe(state);
		}
	);

	const ILLEGAL: [string, ActuationState, ActuationEvent][] = [
		["sent + POSITION", SENT, EVENTS.POSITION],
		["sent + TIMEOUT", SENT, EVENTS.TIMEOUT],
		["accepted + ACCEPTED", ACCEPTED, EVENTS.ACCEPTED],
		["accepted + REFUSED", ACCEPTED, EVENTS.REFUSED],
		["actuated + ACCEPTED", ACTUATED, EVENTS.ACCEPTED],
		["actuated + REFUSED", ACTUATED, EVENTS.REFUSED],
		["unconfirmed + ACCEPTED", UNCONFIRMED, EVENTS.ACCEPTED],
		["unconfirmed + REFUSED", UNCONFIRMED, EVENTS.REFUSED],
		...REFUSED_STATES.flatMap((state) =>
			Object.values(EVENTS).map(
				(event): [string, ActuationState, ActuationEvent] => [
					`${state.phase} + ${event.type}`,
					state,
					event,
				]
			)
		),
	];

	it.each(ILLEGAL)("%s throws", (_label, state, event) => {
		expect(() => transition(state, event)).toThrow(
			IllegalActuationTransitionError
		);
	});

	it("names the phase and the event it refused", () => {
		expect(() => transition(SENT, EVENTS.TIMEOUT)).toThrow(
			"Illegal actuation transition sent -[TIMEOUT]->"
		);
	});
});

describe("storedAttempt and attemptState", () => {
	it.each([
		["accepted", ACCEPTED],
		["actuated", ACTUATED],
		["unconfirmed", UNCONFIRMED],
	] as const)("stores %s and rebuilds it", (_phase, state) => {
		const stored = storedAttempt(state);
		expect(stored).not.toBeNull();
		expect(attemptState(stored!, "unlock", "locked")).toEqual(state);
	});

	it("stores only actuatedAt for an actuated attempt", () => {
		expect(storedAttempt(ACCEPTED)).toEqual({
			actuation: "accepted",
			requestedAt: T0,
		});
		expect(storedAttempt(ACCEPTED)).not.toHaveProperty("actuatedAt");
		expect(storedAttempt(ACTUATED)).toEqual({
			actuation: "actuated",
			requestedAt: T0,
			actuatedAt: T0 + 1500,
		});
	});

	it.each([SENT, ...REFUSED_STATES])("stores nothing for $phase", (state) => {
		expect(storedAttempt(state)).toBeNull();
	});

	it("refuses an actuated row with no actuatedAt", () => {
		expect(() =>
			attemptState(
				{ actuation: "actuated", requestedAt: T0 },
				"unlock",
				"locked"
			)
		).toThrow(/actuatedAt/);
	});
});
