// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

const { toasterCreate } = vi.hoisted(() => ({ toasterCreate: vi.fn() }));

vi.mock("../../../shared/toaster.ts", () => ({
	toaster: { create: toasterCreate },
}));
vi.mock("convex-solidjs", () => ({ useMutation: () => ({}) }));
vi.mock("../../../../convex/_generated/api", () => ({ api: {} }));

import { rollBack, withoutOverride } from "./timelineInteraction.ts";

afterEach(() => {
	toasterCreate.mockReset();
});

const ATTEMPTED = { startMs: 1, endMs: 2 };

test("drops the override of a bar whose move was refused", () => {
	expect(
		withoutOverride(
			{ p1: ATTEMPTED, p2: { startMs: 5, endMs: 6 } },
			"p1",
			ATTEMPTED
		)
	).toEqual({ p2: { startMs: 5, endMs: 6 } });
});

test("keeps an override a newer drag has replaced", () => {
	const newer = { startMs: 3, endMs: 4 };
	expect(withoutOverride({ p1: newer }, "p1", ATTEMPTED)).toEqual({
		p1: newer,
	});
});

test("rollBack undoes the override and toasts the reason once", () => {
	let overrides: Record<string, typeof ATTEMPTED> = { p1: ATTEMPTED };
	rollBack(
		(update) => {
			overrides =
				typeof update === "function" ? update(overrides) : update;
			return overrides;
		},
		"p1" as never,
		ATTEMPTED,
		"You can't do that."
	);
	expect(overrides).toEqual({});
	expect(toasterCreate).toHaveBeenCalledOnce();
	expect(toasterCreate).toHaveBeenCalledWith({
		type: "error",
		title: "You can't do that.",
	});
});
