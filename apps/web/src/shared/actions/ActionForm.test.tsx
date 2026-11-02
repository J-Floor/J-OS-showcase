// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { ActionButton } from "./ActionButton.tsx";
import { ActionForm } from "./ActionForm.tsx";
import {
	CREATE_TARGET,
	type CreateTarget,
	type ActionDescriptor,
} from "./shortcuts.ts";

afterEach(cleanup);

function create(ran: string[], isReady = true): ActionDescriptor<CreateTarget> {
	return {
		id: "create",
		label: "Create",
		icon: "add",
		hotkey: "Mod+Enter",
		can: () => isReady,
		run: (target) => {
			ran.push(target);
			return new Promise(() => {});
		},
	};
}

test("Enter in a field runs the form's action, through the guard the button shares", () => {
	const ran: string[] = [];
	const action = create(ran);
	render(() => (
		<>
			<ActionForm action={action} target={CREATE_TARGET}>
				<input aria-label="Name" />
			</ActionForm>
			<ActionButton action={action} target={CREATE_TARGET} />
		</>
	));
	const form = screen.getByRole("textbox", { name: "Name" }).closest("form");
	if (form === null) throw new Error("no form");
	fireEvent.submit(form);
	expect(screen.getByRole("button", { name: /Create/ })).toHaveAttribute(
		"aria-busy",
		"true"
	);
	fireEvent.click(screen.getByRole("button", { name: /Create/ }));
	fireEvent.submit(form);
	expect(ran).toEqual([CREATE_TARGET]);
});

test("the form holds a hidden submit, so Enter in a field submits it", () => {
	render(() => (
		<ActionForm action={create([])} target={CREATE_TARGET}>
			<input aria-label="Name" />
		</ActionForm>
	));
	const submit = document.querySelector('form button[type="submit"]');
	expect(submit).not.toBeNull();
	expect(submit).toHaveAttribute("hidden");
});

test("Enter does nothing while the form cannot be submitted", () => {
	const ran: string[] = [];
	render(() => (
		<ActionForm action={create(ran, false)} target={CREATE_TARGET}>
			<input aria-label="Name" />
		</ActionForm>
	));
	const form = screen.getByRole("textbox", { name: "Name" }).closest("form");
	if (form === null) throw new Error("no form");
	fireEvent.submit(form);
	expect(ran).toEqual([]);
});
