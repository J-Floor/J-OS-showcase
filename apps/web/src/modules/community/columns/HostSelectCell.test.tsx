// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { staffRef } = vi.hoisted(() => ({
	staffRef: { current: undefined as unknown[] | undefined },
}));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../shared/data/boardLevel.tsx", async (orig) => ({
	...(await orig<typeof import("../../../shared/data/boardLevel.tsx")>()),
	useBoardLevel: () => ({
		data: () => staffRef.current,
		isLoading: () => false,
		error: () => undefined,
	}),
}));

import type { Doc } from "../../../../convex/_generated/dataModel";

import { HostSelectCell } from "./HostSelectCell.tsx";

afterEach(() => {
	cleanup();
	staffRef.current = undefined;
});

const row = { _id: "g1", hostedById: "s1" } as unknown as Doc<"people">;

test("shows a skeleton, not blank text, while the staff list loads", () => {
	staffRef.current = undefined;
	const { container } = render(() => <HostSelectCell row={row} />);
	expect(container.querySelector("[data-width='medium']")).not.toBeNull();
	expect(screen.queryByText("Pick a board member")).toBeNull();
});

test("shows the host name once the staff list loads", () => {
	staffRef.current = [{ _id: "s1", firstName: "Bo", lastName: "Ard" }];
	const { container } = render(() => <HostSelectCell row={row} />);
	expect(screen.getByText("Bo Ard")).toBeInTheDocument();
	expect(container.querySelector("[data-width]")).toBeNull();
});
