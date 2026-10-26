// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { errAsync } from "neverthrow";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";

import {
	RosterActionError,
	settleRosterAction,
} from "../actions/RosterActionError.tsx";
import type { ShortcutScope } from "../actions/shortcuts.ts";

import { useSheetEditing } from "./RosterSheet.tsx";

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
