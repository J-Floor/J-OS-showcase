// @vitest-environment happy-dom
import { MemoryRouter, Route, useLocation, useNavigate } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { type JSX, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { LeaveGuards, createLeaveGuards } from "../../routing/leaveGuards.ts";

import { createDraftGuard } from "./createDraftGuard.ts";

afterEach(cleanup);

type Harness = {
	draft: ReturnType<typeof createDraftGuard>;
	setOpen: (isOpen: boolean) => void;
	setName: (name: string) => void;
	onOpenChange: ReturnType<typeof vi.fn>;
	/** What the sheet's discard prompt was asked with, if it was. */
	asked: () => (() => void) | undefined;
	go: (to: string) => void;
	pathname: () => string;
};

let harness!: Harness;

function Shell(props: { children?: JSX.Element }): JSX.Element {
	const guards = createLeaveGuards();
	return (
		<LeaveGuards.Provider value={guards}>
			{props.children}
		</LeaveGuards.Provider>
	);
}

/** A create form prefilled with a tag, its guard, and the router. */
function Form(): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const [name, setName] = createSignal("");
	const [tag, setTag] = createSignal("");
	const onOpenChange = vi.fn((isOpen: boolean) => {
		setOpen(isOpen);
	});
	let asked: (() => void) | undefined;
	const draft = createDraftGuard({
		isOpen: open,
		values: () => ({ name: name(), tag: tag() }),
		onOpenChange,
	});
	draft.discardRef((onDiscard) => {
		asked = onDiscard;
	});
	const navigate = useNavigate();
	const location = useLocation();
	harness = {
		draft,
		setOpen: (isOpen) => {
			// The prefill lands with the open, as a scanned tag does.
			if (isOpen) setTag("A00001");
			setOpen(isOpen);
		},
		setName,
		onOpenChange,
		asked: () => asked,
		go: (to) => {
			navigate(to);
		},
		pathname: () => location.pathname,
	};
	return <p>Form</p>;
}

async function renderForm(): Promise<Harness> {
	render(() => (
		<MemoryRouter root={Shell}>
			<Route path="/" component={Form} />
			<Route path="/elsewhere" component={() => <p>Elsewhere</p>} />
		</MemoryRouter>
	));
	await screen.findByText("Form");
	return harness;
}

test("clean at open, prefilled values included; dirty after a change; clean when changed back", async () => {
	const form = await renderForm();
	form.setOpen(true);
	expect(form.draft.dirty()).toBe(false);
	expect(form.draft.confirmClose()).toBe(false);
	form.setName("Drill");
	expect(form.draft.dirty()).toBe(true);
	expect(form.draft.confirmClose()).toBe(true);
	form.setName("");
	expect(form.draft.dirty()).toBe(false);
});

test("a closed form is never dirty", async () => {
	const form = await renderForm();
	form.setName("Drill");
	expect(form.draft.dirty()).toBe(false);
});

test("while dirty, leaving the page asks through the sheet's prompt; Discard leaves", async () => {
	const form = await renderForm();
	form.setOpen(true);
	form.setName("Drill");
	form.go("/elsewhere");
	await Promise.resolve();
	expect(form.pathname()).toBe("/");
	const discard = form.asked();
	expect(discard).toBeTypeOf("function");
	discard?.();
	expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
});

test("while clean, leaving the page asks nothing", async () => {
	const form = await renderForm();
	form.setOpen(true);
	form.go("/elsewhere");
	expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
	expect(form.asked()).toBeUndefined();
});

test("the sheet's own close (Discard, a create) stands the guard down", async () => {
	const form = await renderForm();
	form.setOpen(true);
	form.setName("Drill");
	form.draft.onOpenChange(false);
	expect(form.onOpenChange).toHaveBeenCalledWith(false);
	expect(form.draft.dirty()).toBe(false);
	form.go("/elsewhere");
	expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
	expect(form.asked()).toBeUndefined();
});

function unloadIsPrevented(): boolean {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
}

test("the browser asks before closing the tab only while dirty", async () => {
	const form = await renderForm();
	form.setOpen(true);
	expect(unloadIsPrevented()).toBe(false);
	form.setName("Drill");
	expect(unloadIsPrevented()).toBe(true);
	form.setName("");
	expect(unloadIsPrevented()).toBe(false);
});
