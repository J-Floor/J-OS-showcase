// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { errAsync } from "neverthrow";
import { afterEach, describe, expect, it } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";

import {
	RosterActionError,
	setShownPerson,
	settleRosterAction,
} from "./RosterActionError.tsx";

const ALICE = "alice" as Id<"people">;
const BOB = "bob" as Id<"people">;
const REFUSAL = { code: "Forbidden", message: "You can't do that." };

afterEach(() => {
	cleanup();
	setShownPerson("members", undefined);
});

describe("settleRosterAction", () => {
	it("shows a refusal for the person the sheet shows", async () => {
		setShownPerson("members", ALICE);
		render(() => <RosterActionError scope="members" personId={ALICE} />);
		const settled = await settleRosterAction(
			"members",
			ALICE,
			errAsync(REFUSAL)
		);
		expect(settled).toEqual({ refused: true });
		expect(screen.getByRole("alert")).toHaveTextContent(REFUSAL.message);
	});

	it("drops a late refusal for a person the sheet no longer shows", async () => {
		setShownPerson("members", BOB);
		render(() => <RosterActionError scope="members" />);
		const settled = await settleRosterAction(
			"members",
			ALICE,
			errAsync(REFUSAL)
		);
		// The caller still learns it was refused (to stop a batch)...
		expect(settled).toEqual({ refused: true });
		// ...but it is not shown against Bob.
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
