import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import { createToaster, Toast } from "./Toast.tsx";

test("renders a created toast with its title and status", async () => {
	const toaster = createToaster();
	render(() => <Toast toaster={toaster} />);
	toaster.create({ type: "error", title: "Could not save the note." });

	expect(await screen.findByText("Could not save the note.")).toBeVisible();
	expect(
		screen.getByText("Could not save the note.").closest("[data-status]")
	).toHaveAttribute("data-status", "error");
});

test("the dismiss button closes the toast", async () => {
	const toaster = createToaster();
	render(() => <Toast toaster={toaster} />);
	toaster.create({ type: "info", title: "Heads up" });

	const title = await screen.findByText("Heads up");
	const root = title.closest('[data-part="root"]');
	fireEvent.click(
		screen.getByRole("button", { name: "Dismiss notification" })
	);
	// Ark marks the toast closed at once and removes it after its exit
	// animation; the closed state is the dismissal, without racing that timer.
	await waitFor(() => {
		expect(root).toHaveAttribute("data-state", "closed");
	});
});

test("clicking the toast runs its action, but not when dismissing", async () => {
	const toaster = createToaster();
	let ran = 0;
	render(() => <Toast toaster={toaster} />);
	toaster.create({
		type: "info",
		title: "Undo?",
		action: {
			label: "Undo",
			onClick: () => {
				ran += 1;
			},
		},
	});

	fireEvent.click(await screen.findByText("Undo?"));
	expect(ran).toBe(1);
	fireEvent.click(
		screen.getByRole("button", { name: "Dismiss notification" })
	);
	expect(ran).toBe(1);
});

test.each([
	["warning", "warning"],
	["loading", "info"],
] as const)("a %s toast shows the %s status", async (type, status) => {
	const toaster = createToaster();
	render(() => <Toast toaster={toaster} />);
	toaster.create({ type, title: `A ${type} toast` });

	const title = await screen.findByText(`A ${type} toast`);
	expect(title.closest("[data-status]")).toHaveAttribute(
		"data-status",
		status
	);
});

test("renders the toast's description under its title", async () => {
	const toaster = createToaster();
	render(() => <Toast toaster={toaster} />);
	toaster.create({
		type: "info",
		title: "Saved",
		description: "Your changes are live.",
	});

	expect(await screen.findByText("Your changes are live.")).toHaveAttribute(
		"data-part",
		"description"
	);
});
