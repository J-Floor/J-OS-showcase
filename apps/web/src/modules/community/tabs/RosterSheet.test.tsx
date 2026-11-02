// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { errAsync } from "neverthrow";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PersonRow } from "../../../../convex/people.ts";
import { OPEN_DIALOG_CONTENT } from "../../../shared/dialogSelectors.ts";
import {
	RosterActionError,
	setShownPerson,
	settleRosterAction,
} from "../actions/RosterActionError.tsx";
import type { ShortcutScope } from "../actions/shortcuts.ts";

import { RosterSheet, useSheetEditing } from "./RosterSheet.tsx";
import { renderWithSelection } from "./testSelection.tsx";

// The footer is under test, not the profile: the detail reads Convex.
vi.mock("../sheets/PersonDetail.tsx", () => ({
	PersonDetail: () => <div />,
}));

afterEach(cleanup);

/** The hook under a root, with the three inputs the sheet feeds it. */
function mountEditing(initial: {
	open: boolean;
	id: string;
	scope: ShortcutScope;
}) {
	return createRoot((dispose) => {
		const [isOpen, setOpen] = createSignal(initial.open);
		const [personId, setPersonId] = createSignal<string | undefined>(
			initial.id
		);
		const [scope, setScope] = createSignal<ShortcutScope>(initial.scope);
		const [editing, setEditing] = useSheetEditing(isOpen, personId, scope);
		return { dispose, editing, setEditing, setOpen, setPersonId, setScope };
	});
}

test("editing survives a change of roster scope", () => {
	const sheet = mountEditing({ open: true, id: "p1", scope: "applications" });
	sheet.setEditing(true);
	sheet.setScope("members");
	expect(sheet.editing()).toBe(true);
	sheet.dispose();
});

test("editing resets when another person is opened or the sheet closes", () => {
	const sheet = mountEditing({ open: true, id: "p1", scope: "members" });
	sheet.setEditing(true);
	sheet.setPersonId("p2");
	expect(sheet.editing()).toBe(false);
	sheet.setEditing(true);
	sheet.setOpen(false);
	expect(sheet.editing()).toBe(false);
	sheet.dispose();
});

test("a roster change clears the old roster's shown person", async () => {
	const sheet = mountEditing({ open: true, id: "p1", scope: "applications" });
	sheet.setScope("members");
	// With the old roster still holding p1, a refusal for p2 would be dropped
	// as a late answer; once cleared, it shows.
	render(() => <RosterActionError scope="applications" />);
	await settleRosterAction(
		"applications",
		"p2" as never,
		errAsync({ code: "Refused", message: "Not allowed" })
	);
	await waitFor(() => {
		expect(screen.getByText("Not allowed")).toBeInTheDocument();
	});
	sheet.dispose();
});

test("the sheet footer shows a refusal for its own person only", async () => {
	const shown = {
		_id: "p1",
		firstName: "Ada",
		lastName: "Example",
	} as unknown as PersonRow;
	// No person registered as shown, so a refusal for p2 is recorded rather
	// than dropped as a late answer: hiding it is then the footer's doing.
	setShownPerson("guests", undefined);
	renderWithSelection(() => (
		<>
			<RosterActionError scope="guests" />
			<RosterSheet
				isOpen
				isLoading={false}
				selected={shown}
				isEditing={false}
				onToggleEditing={() => {}}
				onClose={() => {}}
				actions={[]}
				scope="guests"
			/>
		</>
	));
	await waitFor(() => {
		expect(document.querySelector(OPEN_DIALOG_CONTENT)).not.toBeNull();
	});
	const panel = document.querySelector<HTMLElement>(OPEN_DIALOG_CONTENT)!;

	await settleRosterAction(
		"guests",
		"p1" as Id<"people">,
		errAsync({ code: "Refused", message: "Refused for Ada" })
	);
	await waitFor(() => {
		expect(within(panel).getByText("Refused for Ada")).toBeInTheDocument();
	});

	await settleRosterAction(
		"guests",
		"p2" as Id<"people">,
		errAsync({ code: "Refused", message: "Refused for someone else" })
	);
	// The strip above the table shows it; the sheet, about Ada, does not.
	await waitFor(() => {
		expect(
			screen.getByText("Refused for someone else")
		).toBeInTheDocument();
	});
	expect(within(panel).queryByRole("alert")).toBeNull();
});
