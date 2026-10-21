// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

const { setHost } = vi.hoisted(() => ({ setHost: vi.fn() }));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: setHost }),
}));

vi.mock("../../../shared/data/boardLevel.tsx", async (orig) => ({
	...(await orig<typeof import("../../../shared/data/boardLevel.tsx")>()),
	useBoardLevel: () => ({
		data: () => [{ _id: "s1", firstName: "Bo", lastName: "Ard" }],
		isLoading: () => false,
		error: () => {},
	}),
}));

// The real picker is an Ark listbox in a portal; what matters here is only
// that choosing a host commits it.
vi.mock("./HostSelect.tsx", () => ({
	HostSelect: (props: { onCommit: (id: unknown) => void }) => (
		<button
			type="button"
			onClick={() => {
				props.onCommit("s2");
			}}
		>
			pick another host
		</button>
	),
}));

import type { Doc } from "../../../../convex/_generated/dataModel";

import { HostSelectCell } from "./HostSelectCell.tsx";

afterEach(() => {
	cleanup();
	setHost.mockReset();
});

const row = { _id: "g1", hostedById: "s1" } as unknown as Doc<"people">;

test("a refused host change shows why in the cell and keeps the previous host", async () => {
	setHost.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	render(() => <HostSelectCell row={row} />);
	fireEvent.click(screen.getByRole("button", { name: "Bo Ard" }));
	fireEvent.click(screen.getByRole("button", { name: "pick another host" }));

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"You can't do that."
	);
	expect(screen.getByRole("button", { name: "Bo Ard" })).toBeInTheDocument();
});
