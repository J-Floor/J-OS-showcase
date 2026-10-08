// @vitest-environment happy-dom
import { render, fireEvent, cleanup, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { createActionKeys } from "./createActionKeys.ts";
import type { ActionDescriptor } from "./shortcuts.ts";

// apps/web does not run vitest in `globals` mode (every test file imports its
// own `test`/`expect`), so `@solidjs/testing-library`'s own auto-cleanup —
// which only registers itself when it finds a GLOBAL `afterEach` — never
// fires here. Without this, each test's `document`-level "D" registration
// outlives it (nothing ever unmounts the previous `<Probe/>`), and the next
// test's keydown triggers every stale handler still registered alongside its
// own — which is exactly the "'D' is already registered" warning this
// prevents.
afterEach(cleanup);

type Person = { _id: string; deniable: boolean };

function setup(opts: {
	drawerPerson?: Person;
	selected?: Person[];
	focused?: Person;
	active?: boolean;
}) {
	const ran: string[] = [];
	const advanced: number[] = [];
	const cleared: number[] = [];
	const deny: ActionDescriptor<Person> = {
		id: "deny",
		label: "Turn down",
		icon: "close",
		hotkey: "D",
		scope: "applications",
		can: (person) => person.deniable,
		run: (person) => {
			ran.push(person._id);
		},
	};
	function Probe() {
		createActionKeys<Person>({
			actions: () => [deny],
			drawerPerson: () => opts.drawerPerson,
			selected: () => opts.selected ?? [],
			focused: () => opts.focused,
			onAdvance: () => advanced.push(1),
			onClearSelection: () => cleared.push(1),
			active: () => opts.active ?? true,
		});
		return <div />;
	}
	render(() => <Probe />);
	return { ran, advanced, cleared };
}

function person(id: string, deniable = true): Person {
	return { _id: id, deniable };
}

test("the open drawer's person wins over everything else", () => {
	const { ran } = setup({
		drawerPerson: person("drawer"),
		selected: [person("checked")],
		focused: person("focused"),
	});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["drawer"]);
});

test("a checked selection wins over focus", async () => {
	const { ran, cleared } = setup({
		selected: [person("one"), person("two")],
		focused: person("focused"),
	});
	fireEvent.keyDown(document, { key: "d" });
	// The batch loop `await`s each `run()` in turn, even a synchronous one —
	// `await` always defers its continuation to a microtask, so the second
	// (and later) targets land a tick after the keydown handler itself
	// returns, not within it.
	await waitFor(() => {
		expect(ran).toEqual(["one", "two"]);
	});
	expect(cleared).toHaveLength(1);
});

test("a batch skips the rows the action does not apply to", () => {
	const { ran } = setup({
		selected: [person("yes"), person("no", false)],
	});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["yes"]);
});

test("the focused row is the fallback, and focus advances", async () => {
	const { ran, advanced } = setup({ focused: person("focused") });
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["focused"]);
	// `onAdvance` fires after `await action.run(row)` resolves — a microtask
	// after the keydown handler itself returns, even for a synchronous `run`.
	await waitFor(() => {
		expect(advanced).toHaveLength(1);
	});
});

test("with no target the key does nothing", () => {
	const { ran } = setup({});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual([]);
});

test("an action that does not apply does nothing, silently", () => {
	const { ran, advanced } = setup({ focused: person("focused", false) });
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual([]);
	expect(advanced).toEqual([]);
});

test("keys are dead while the tab is not the one on screen", () => {
	const { ran } = setup({ focused: person("focused"), active: false });
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual([]);
});

test("typing the letter into a field does not fire the action", () => {
	const { ran } = setup({ focused: person("focused") });
	const field = document.createElement("input");
	document.body.append(field);
	fireEvent.keyDown(field, { key: "d" });
	expect(ran).toEqual([]);
});

test("a held key fires once", () => {
	const { ran } = setup({ focused: person("focused") });
	fireEvent.keyDown(document, { key: "d" });
	fireEvent.keyDown(document, { key: "d", repeat: true });
	expect(ran).toEqual(["focused"]);
});

test("an ineligible drawer person stops the key dead — it does not fall through to the selection or the focused row", async () => {
	const { ran } = setup({
		drawerPerson: person("drawer", false),
		selected: [person("checked")],
		focused: person("focused"),
	});
	fireEvent.keyDown(document, { key: "d" });
	// The checked-selection branch resolves through an `await`, so a wrong
	// fall-through would only show up a tick after the keydown handler
	// itself returns. `waitFor` would return the instant a passing assertion
	// is seen — which is immediately, since `ran` starts empty — so it would
	// not actually wait for a buggy async fall-through to land. A real
	// macrotask flush (microtasks always drain before a `setTimeout(0)`
	// fires) is what makes this assertion mean something.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(ran).toEqual([]);
});
