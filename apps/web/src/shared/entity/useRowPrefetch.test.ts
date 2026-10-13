import { createRoot } from "solid-js";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/ability.tsx", () => ({
	useAbility: () => () => ({
		can: (action: string) => action === "view",
	}),
}));

import { useRowPrefetch } from "./useRowPrefetch.ts";

type Row = { _id: string };

function hook(
	prefetch: (row: Row, can: (a: never, s: never) => boolean) => void
) {
	return createRoot(() => useRowPrefetch<Row>({ prefetch }));
}

it("hands the row and the viewer's ability to the descriptor", () => {
	const prefetch = vi.fn((row: Row, can: (a: never, s: never) => boolean) => {
		expect(row._id).toBe("r1");
		expect(can("view" as never, "Events" as never)).toBe(true);
		expect(can("manage" as never, "Events" as never)).toBe(false);
	});
	hook(prefetch)({ _id: "r1" });
	expect(prefetch).toHaveBeenCalledOnce();
});

it("does nothing without a row or a descriptor prefetch", () => {
	const prefetch = vi.fn();
	hook(prefetch)(undefined);
	expect(prefetch).not.toHaveBeenCalled();
	expect(() => {
		createRoot(() => useRowPrefetch<Row>(undefined))({ _id: "r1" });
	}).not.toThrow();
});
