import {
	INITIAL_RING,
	type RingContext,
	type RingInputs,
	type RingState,
	ringId,
	step,
} from "./ringMachine.ts";

const ctx: RingContext = { rowIds: ["a", "b", "c"], autofocusFirstRow: true };
const LIVE: RingInputs = {
	selection: false,
	suppressed: false,
	pinned: undefined,
};

function inputs(state: RingState, patch: Partial<RingInputs>, c = ctx) {
	return step(state, { type: "inputs", inputs: { ...LIVE, ...patch } }, c);
}

describe("inputs", () => {
	test("going live from the initial state lands in auto and takes focus", () => {
		const out = inputs(INITIAL_RING, {});
		expect(out.state).toEqual({ kind: "auto" });
		expect(out.takeFocus).toBe(true);
	});

	test("auto rings the first row only with autofocusFirstRow", () => {
		expect(ringId({ kind: "auto" }, ctx)).toBe("a");
		expect(
			ringId({ kind: "auto" }, { ...ctx, autofocusFirstRow: false })
		).toBeUndefined();
	});

	test("auto follows a re-sorted first row without a transition", () => {
		expect(ringId({ kind: "auto" }, { ...ctx, rowIds: ["c", "a"] })).toBe(
			"c"
		);
	});

	test("selection wins over a pin and over suppression", () => {
		const out = inputs(
			{ kind: "user", id: "b", index: 1 },
			{ selection: true, pinned: "c", suppressed: true }
		);
		expect(out.state).toEqual({ kind: "inert" });
		expect(out.takeFocus).toBe(false);
	});

	test("a pin wins over suppression and records the pinned row's index", () => {
		const out = inputs({ kind: "auto" }, { suppressed: true, pinned: "c" });
		expect(out.state).toEqual({ kind: "pinned", id: "c", index: 2 });
	});

	test("a pin on a row not in view keeps the previous index", () => {
		const out = inputs(
			{ kind: "user", id: "b", index: 1 },
			{ suppressed: true, pinned: "zz" }
		);
		expect(out.state).toEqual({ kind: "pinned", id: "zz", index: 1 });
	});

	test("suppression without a pin is inert", () => {
		expect(
			inputs({ kind: "user", id: "b", index: 1 }, { suppressed: true })
				.state
		).toEqual({ kind: "inert" });
	});

	test("releasing a pin leaves the ring on that row, as the user's, and takes focus", () => {
		const out = inputs({ kind: "pinned", id: "c", index: 2 }, {});
		expect(out.state).toEqual({ kind: "user", id: "c", index: 2 });
		expect(out.takeFocus).toBe(true);
	});

	test("releasing a pin while still suppressed is inert", () => {
		expect(
			inputs({ kind: "pinned", id: "c", index: 2 }, { suppressed: true })
				.state
		).toEqual({ kind: "inert" });
	});

	test("coming back from inert re-seats to auto, forgetting the user's row", () => {
		expect(inputs({ kind: "inert" }, {}).state).toEqual({ kind: "auto" });
	});

	test("unchanged live inputs keep the state and do not take focus", () => {
		const user: RingState = { kind: "user", id: "b", index: 1 };
		const out = inputs(user, {});
		expect(out.state).toBe(user);
		expect(out.takeFocus).toBe(false);
	});
});

describe("arrow", () => {
	test("the first press from an empty ring lands on the first row", () => {
		const out = step(
			{ kind: "auto" },
			{ type: "arrow", delta: -1 },
			{ ...ctx, autofocusFirstRow: false }
		);
		expect(out.state).toEqual({ kind: "user", id: "a", index: 0 });
		expect(out.takeFocus).toBe(false);
	});

	test("moves from the autofocused first row", () => {
		expect(
			step({ kind: "auto" }, { type: "arrow", delta: 1 }, ctx).state
		).toEqual({ kind: "user", id: "b", index: 1 });
	});

	test("clamps at both ends", () => {
		expect(
			step(
				{ kind: "user", id: "c", index: 2 },
				{ type: "arrow", delta: 1 },
				ctx
			).state
		).toEqual({ kind: "user", id: "c", index: 2 });
		expect(
			step(
				{ kind: "user", id: "a", index: 0 },
				{ type: "arrow", delta: -1 },
				ctx
			).state
		).toEqual({ kind: "user", id: "a", index: 0 });
	});

	test("a ring on a row that left restarts from the first row", () => {
		expect(
			step(
				{ kind: "user", id: "gone", index: 1 },
				{ type: "arrow", delta: 1 },
				ctx
			).state
		).toEqual({ kind: "user", id: "a", index: 0 });
	});

	test("is ignored while inert or pinned, and with no rows", () => {
		const pinned: RingState = { kind: "pinned", id: "b", index: 1 };
		expect(
			step({ kind: "inert" }, { type: "arrow", delta: 1 }, ctx).state
		).toEqual({ kind: "inert" });
		expect(step(pinned, { type: "arrow", delta: 1 }, ctx).state).toBe(
			pinned
		);
		const auto: RingState = { kind: "auto" };
		expect(
			step(auto, { type: "arrow", delta: 1 }, { ...ctx, rowIds: [] })
				.state
		).toBe(auto);
	});
});

describe("advance", () => {
	test("lands on whatever now holds the saved index", () => {
		const out = step(
			{ kind: "user", id: "b", index: 1 },
			{ type: "advance" },
			{ ...ctx, rowIds: ["a", "c"] }
		);
		expect(out.state).toEqual({ kind: "user", id: "c", index: 1 });
	});

	test("clamps to the last row when the tail is removed", () => {
		expect(
			step(
				{ kind: "user", id: "c", index: 2 },
				{ type: "advance" },
				{ ...ctx, rowIds: ["a", "b"] }
			).state
		).toEqual({ kind: "user", id: "b", index: 1 });
	});

	test("from auto steps from index 0", () => {
		expect(
			step(
				{ kind: "auto" },
				{ type: "advance" },
				{ ...ctx, rowIds: ["b", "c"] }
			).state
		).toEqual({ kind: "user", id: "b", index: 0 });
	});

	test("with no rows leaves the ring nowhere", () => {
		expect(
			step(
				{ kind: "user", id: "a", index: 0 },
				{ type: "advance" },
				{ ...ctx, rowIds: [] }
			).state
		).toEqual({ kind: "user", id: undefined, index: 0 });
	});

	test("lands on a row with no id as no ring", () => {
		const out = step(
			{ kind: "user", id: "a", index: 0 },
			{ type: "advance" },
			{ ...ctx, rowIds: [undefined, "b"] }
		);
		expect(ringId(out.state, ctx)).toBeUndefined();
	});

	test("is ignored while inert or pinned", () => {
		const pinned: RingState = { kind: "pinned", id: "b", index: 1 };
		expect(step({ kind: "inert" }, { type: "advance" }, ctx).state).toEqual(
			{ kind: "inert" }
		);
		expect(step(pinned, { type: "advance" }, ctx).state).toBe(pinned);
	});
});
