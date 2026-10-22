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
 * - `pinned`: an open sheet shows this row. Shown, not interactive.
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

export function ringId(
	state: RingState,
	context: RingContext
): string | undefined {
	switch (state.kind) {
		case "inert":
			return undefined;
		case "auto":
			return context.autofocusFirstRow ? context.rowIds[0] : undefined;
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

function onInputs(
	state: RingState,
	inputs: RingInputs,
	context: RingContext
): RingState {
	const { selection, suppressed, pinned } = inputs;
	if (selection) return INITIAL_RING;
	if (pinned !== undefined) {
		if (state.kind === "pinned" && state.id === pinned) return state;
		const found = context.rowIds.indexOf(pinned);
		return {
			kind: "pinned",
			id: pinned,
			index: found >= 0 ? found : savedIndex(state),
		};
	}
	if (suppressed) return INITIAL_RING;
	if (state.kind === "pinned") {
		const found = context.rowIds.indexOf(state.id);
		return {
			kind: "user",
			id: state.id,
			index: found >= 0 ? found : state.index,
		};
	}
	return state.kind === "inert" ? { kind: "auto" } : state;
}

function onArrow(
	state: RingState,
	delta: number,
	context: RingContext
): RingState {
	const count = context.rowIds.length;
	if (!isLive(state) || count === 0) return state;
	const id = ringId(state, context);
	const current = id === undefined ? -1 : context.rowIds.indexOf(id);
	const index =
		current === -1 ? 0 : Math.min(Math.max(current + delta, 0), count - 1);
	return { kind: "user", id: context.rowIds[index], index };
}

function onAdvance(state: RingState, context: RingContext): RingState {
	if (!isLive(state)) return state;
	const count = context.rowIds.length;
	if (count === 0) return { kind: "user", id: undefined, index: 0 };
	const index = Math.min(savedIndex(state), count - 1);
	return { kind: "user", id: context.rowIds[index], index };
}

function transition(
	state: RingState,
	event: RingEvent,
	context: RingContext
): RingState {
	switch (event.type) {
		case "inputs":
			return onInputs(state, event.inputs, context);
		case "arrow":
			return onArrow(state, event.delta, context);
		case "advance":
			return onAdvance(state, context);
	}
}

export function step(
	state: RingState,
	event: RingEvent,
	context: RingContext
): RingStep {
	const next = transition(state, event, context);
	return { state: next, takeFocus: !isLive(state) && isLive(next) };
}
