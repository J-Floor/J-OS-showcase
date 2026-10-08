/**
 * Where a table's row-focus ring is, and why, as one pure reducer.
 *
 * The ring used to live in three effects and a `userMoved` flag that each
 * patched the others' results. The edge that matters most, "the table just
 * became the thing keys go to" (`takeFocus`), needs the previous state, which
 * loose effects never had. No Solid here: the Table feeds events in and reads
 * the state back.
 *
 * - `inert`: a checkbox selection owns the keys, or the caller suppressed the
 *   ring with nothing pinned. No ring.
 * - `pinned`: an open drawer shows this row. Shown, not interactive.
 * - `auto`: live, and nobody has placed the ring. It sits on the first row
 *   (with `autofocusFirstRow`), whichever row that currently is.
 * - `user`: live, and an arrow, an `advance()` or a released pin placed it.
 */

export type RingState =
	| { kind: "inert" }
	| { kind: "pinned"; id: string; index: number }
	| { kind: "auto" }
	| { kind: "user"; id: string | undefined; index: number };

export type RingInputs = {
	selection: boolean;
	suppressed: boolean;
	pinned: string | undefined;
};

export type RingEvent =
	| { type: "inputs"; inputs: RingInputs }
	| { type: "arrow"; delta: number }
	| { type: "advance" };

/** The rows the ring can land on, in render order. A row with no usable id is
 *  `undefined`: it can be landed on but never matches as focused. */
export type RingContext = {
	rowIds: readonly (string | undefined)[];
	autofocusFirstRow: boolean;
};

export type RingStep = { state: RingState; takeFocus: boolean };

export const INITIAL_RING: RingState = { kind: "inert" };

export function ringId(state: RingState, ctx: RingContext): string | undefined {
	switch (state.kind) {
		case "inert":
			return undefined;
		case "auto":
			return ctx.autofocusFirstRow ? ctx.rowIds[0] : undefined;
		case "pinned":
		case "user":
			return state.id;
	}
}

export function isLive(state: RingState): boolean {
	return state.kind === "auto" || state.kind === "user";
}

/** The index `advance()` steps from. Captured when the ring was placed,
 *  because by the time an action resolves the acted-on row has usually left. */
function savedIndex(state: RingState): number {
	return state.kind === "pinned" || state.kind === "user" ? state.index : 0;
}

function transition(
	state: RingState,
	event: RingEvent,
	ctx: RingContext
): RingState {
	const count = ctx.rowIds.length;
	switch (event.type) {
		case "inputs": {
			const { selection, suppressed, pinned } = event.inputs;
			if (selection) return INITIAL_RING;
			if (pinned !== undefined) {
				if (state.kind === "pinned" && state.id === pinned)
					return state;
				const found = ctx.rowIds.indexOf(pinned);
				return {
					kind: "pinned",
					id: pinned,
					index: found >= 0 ? found : savedIndex(state),
				};
			}
			if (suppressed) return INITIAL_RING;
			if (state.kind === "pinned") {
				const found = ctx.rowIds.indexOf(state.id);
				return {
					kind: "user",
					id: state.id,
					index: found >= 0 ? found : state.index,
				};
			}
			if (state.kind === "inert") return { kind: "auto" };
			return state;
		}
		case "arrow": {
			if (!isLive(state) || count === 0) return state;
			const id = ringId(state, ctx);
			const current = id === undefined ? -1 : ctx.rowIds.indexOf(id);
			const index =
				current === -1
					? 0
					: Math.min(Math.max(current + event.delta, 0), count - 1);
			return { kind: "user", id: ctx.rowIds[index], index };
		}
		case "advance": {
			if (!isLive(state)) return state;
			if (count === 0) return { kind: "user", id: undefined, index: 0 };
			const index = Math.min(savedIndex(state), count - 1);
			return { kind: "user", id: ctx.rowIds[index], index };
		}
	}
}

export function step(
	state: RingState,
	event: RingEvent,
	ctx: RingContext
): RingStep {
	const next = transition(state, event, ctx);
	return { state: next, takeFocus: !isLive(state) && isLive(next) };
}
