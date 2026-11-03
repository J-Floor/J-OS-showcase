// @vitest-environment happy-dom
import {
	DatePicker,
	Select,
	Sheet,
	useOverlayCovered,
} from "@j-os/design-system";
import {
	render,
	fireEvent,
	cleanup,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { For, createSignal, type JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { ActionButton } from "./ActionButton.tsx";
import { batchOf, type BatchableAction } from "./batchOf.ts";
import { ActionKeys, createActionKeys } from "./createActionKeys.ts";
import {
	eligible,
	type ActionDescriptor,
	type ActionOutcome,
} from "./shortcuts.ts";

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

function setup(options: {
	target?: Person;
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
		can: (person) => person.deniable,
		run: (person) => {
			ran.push(person._id);
		},
	};
	function Probe() {
		createActionKeys<Person>({
			scope: "applications",
			actions: () => [deny],
			target: () => options.target,
			selected: () => options.selected ?? [],
			focused: () => options.focused,
			onAdvance: () => advanced.push(1),
			onClearSelection: () => cleared.push(1),
			active: () => options.active ?? true,
		});
		return <div />;
	}
	render(() => <Probe />);
	return { ran, advanced, cleared };
}

function person(id: string, isDeniable = true): Person {
	return { _id: id, deniable: isDeniable };
}

test("the open sheet's person wins over everything else", () => {
	const { ran } = setup({
		target: person("sheet"),
		selected: [person("checked")],
		focused: person("focused"),
	});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["sheet"]);
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

test("an ineligible sheet person stops the key dead — it does not fall through to the selection or the focused row", async () => {
	const { ran } = setup({
		target: person("sheet", false),
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

test("a scope with no table acts on the sheet's target alone", () => {
	const ran: string[] = [];
	const [shown, setShown] = createSignal<Person | undefined>(person("shown"));
	function Probe() {
		createActionKeys<Person>({
			scope: "sheet",
			actions: () => [
				{
					id: "deny",
					label: "Turn down",
					icon: "close",
					hotkey: "D",
					can: () => true,
					run: (target) => {
						ran.push(target._id);
					},
				},
			],
			target: shown,
			active: () => true,
		});
		return <div />;
	}
	render(() => <Probe />);
	fireEvent.keyDown(document, { key: "d" });
	setShown(undefined);
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["shown"]);
});

/** A sheet over the page, opened and closed by the test. */
function Overlay(props: { open: boolean; children?: JSX.Element }) {
	return (
		<Sheet.Root open={props.open} onOpenChange={() => {}}>
			<Sheet.Header>
				<Sheet.Title>Covering sheet</Sheet.Title>
			</Sheet.Header>
			{props.children}
		</Sheet.Root>
	);
}

function denyAction(ran: string[]): ActionDescriptor<Person> {
	return {
		id: "deny",
		label: "Turn down",
		icon: "close",
		hotkey: "D",
		can: () => true,
		run: (target) => {
			ran.push(target._id);
		},
	};
}

test("a page scope under an open overlay ignores its key, and answers again once it closes", async () => {
	const ran: string[] = [];
	const [isOpen, setOpen] = createSignal(true);
	let isPageCovered: (() => boolean) | undefined;
	function Probe() {
		createActionKeys<Person>({
			scope: "page",
			actions: () => [denyAction(ran)],
			target: () => person("page"),
			active: () => true,
		});
		isPageCovered = useOverlayCovered();
		return <Overlay open={isOpen()} />;
	}
	render(() => <Probe />);
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual([]);
	setOpen(false);
	await waitFor(() => {
		expect(isPageCovered?.()).toBe(false);
	});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["page"]);
});

test("a sheet's keys, bound inside it, answer while it is on top, and not under another one", async () => {
	const ran: string[] = [];
	const [isCovering, setCovering] = createSignal(false);
	let isSheetCovered: (() => boolean) | undefined;
	function CoverProbe() {
		isSheetCovered = useOverlayCovered();
		return null;
	}
	render(() => (
		<>
			<Overlay open>
				<ActionKeys<Person>
					scope="sheet"
					actions={() => [denyAction(ran)]}
					target={() => person("sheet")}
					active={() => true}
				/>
				<CoverProbe />
			</Overlay>
			<Overlay open={isCovering()} />
		</>
	));
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["sheet"]);
	setCovering(true);
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["sheet"]);
	setCovering(false);
	await waitFor(() => {
		expect(isSheetCovered?.()).toBe(false);
	});
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["sheet", "sheet"]);
});

/** A run that stays in flight until `settle` is called. */
function inFlight<T>(value: T): { promise: Promise<T>; settle: () => void } {
	let resolve: ((settled: T) => void) | undefined;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return {
		promise,
		settle() {
			resolve?.(value);
		},
	};
}

/** A sheet-target scope whose one action is `hotkey`, recording each run. */
function bindOne(
	hotkey: ActionDescriptor<Person>["hotkey"],
	run?: () => Promise<undefined>
) {
	const ran: string[] = [];
	function Probe() {
		createActionKeys<Person>({
			scope: "sheet",
			actions: () => [
				{
					id: "submit",
					label: "Submit",
					icon: "check",
					hotkey,
					can: () => true,
					run: (target) => {
						ran.push(target._id);
						return run?.();
					},
				},
			],
			target: () => person("form"),
			active: () => true,
		});
		return <div />;
	}
	render(() => <Probe />);
	return ran;
}

function fieldIn(parent: HTMLElement = document.body): HTMLInputElement {
	const field = document.createElement("input");
	parent.append(field);
	return field;
}

test("a modifier combo fires from inside a field: it types nothing", () => {
	const ran = bindOne("Mod+Enter");
	fireEvent.keyDown(fieldIn(), { key: "Enter", ctrlKey: true });
	expect(ran).toEqual(["form"]);
});

test("Escape fires from inside a field: it types nothing", () => {
	const ran = bindOne("Escape");
	fireEvent.keyDown(fieldIn(), { key: "Escape" });
	expect(ran).toEqual(["form"]);
});

test("a key that deletes text stays the field's while typing", () => {
	const ran = bindOne("Delete");
	fireEvent.keyDown(fieldIn(), { key: "Delete" });
	expect(ran).toEqual([]);
});

test("a modifier combo pressed inside an open alert dialog is the dialog's", () => {
	const ran = bindOne("Mod+Enter");
	const dialog = document.createElement("div");
	dialog.setAttribute("role", "alertdialog");
	dialog.dataset.state = "open";
	document.body.append(dialog);
	fireEvent.keyDown(fieldIn(dialog), { key: "Enter", ctrlKey: true });
	expect(ran).toEqual([]);
	dialog.remove();
});

test("a second press while the first run is in flight does nothing", async () => {
	const run = inFlight(undefined);
	const ran = bindOne("D", () => run.promise);
	fireEvent.keyDown(document, { key: "d" });
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["form"]);
	run.settle();
	await new Promise((resolve) => setTimeout(resolve, 0));
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["form", "form"]);
});

test("a modifier combo pressed while a select's list is open in the form is the list's", async () => {
	const ran: string[] = [];
	render(() => (
		<Overlay open>
			<ActionKeys<Person>
				scope="form"
				actions={() => [
					{ ...denyAction(ran), id: "create", hotkey: "Mod+Enter" },
				]}
				target={() => person("form")}
				active={() => true}
			/>
			<Select.Root label="Kind" defaultOpen>
				<Select.Option value="a">A</Select.Option>
			</Select.Root>
		</Overlay>
	));
	await waitFor(() => {
		expect(
			document.querySelector('[role="listbox"][data-state="open"]')
		).not.toBeNull();
	});
	fireEvent.keyDown(document.activeElement ?? document, {
		key: "Enter",
		ctrlKey: true,
	});
	expect(ran).toEqual([]);
});

test("a modifier combo pressed while a date picker's calendar is open is the calendar's", async () => {
	const ran: string[] = [];
	render(() => (
		<Overlay open>
			<ActionKeys<Person>
				scope="form"
				actions={() => [
					{ ...denyAction(ran), id: "create", hotkey: "Mod+Enter" },
				]}
				target={() => person("form")}
				active={() => true}
			/>
			<DatePicker label="Starts" value={null} defaultOpen />
		</Overlay>
	));
	await waitFor(() => {
		expect(
			document.querySelector(
				'[data-scope="date-picker"][data-part="content"][data-state="open"]'
			)
		).not.toBeNull();
	});
	fireEvent.keyDown(document.activeElement ?? document, {
		key: "Enter",
		ctrlKey: true,
	});
	expect(ran).toEqual([]);
});

test("a run in flight holds its own target only: another row's run goes ahead", () => {
	const run = inFlight(undefined);
	const ran: string[] = [];
	const action: ActionDescriptor<Person> = {
		...denyAction(ran),
		run: (target) => {
			ran.push(target._id);
			return run.promise;
		},
	};
	const [shown, setShown] = createSignal(person("one"));
	function Probe() {
		createActionKeys<Person>({
			scope: "rows",
			actions: () => [action],
			target: shown,
			active: () => true,
		});
		return null;
	}
	render(() => <Probe />);
	fireEvent.keyDown(document, { key: "d" });
	// The same row, refetched as a new object: still in flight.
	setShown(person("one"));
	fireEvent.keyDown(document, { key: "d" });
	setShown(person("two"));
	fireEvent.keyDown(document, { key: "d" });
	expect(ran).toEqual(["one", "two"]);
	run.settle();
});

test("the key and the button share one run: pressing then clicking runs once", () => {
	const run = inFlight(undefined);
	const ran: string[] = [];
	const action: ActionDescriptor<Person> = {
		...denyAction(ran),
		run: (target) => {
			ran.push(target._id);
			return run.promise;
		},
	};
	function Probe() {
		createActionKeys<Person>({
			scope: "footer",
			actions: () => [action],
			target: () => person("shown"),
			active: () => true,
		});
		return <ActionButton action={action} target={person("shown")} />;
	}
	render(() => <Probe />);
	fireEvent.keyDown(document, { key: "d" });
	fireEvent.click(screen.getByRole("button", { name: /Turn down/ }));
	expect(ran).toEqual(["shown"]);
	run.settle();
});

test("a press on a focused row whose run is in flight does not move the ring", async () => {
	const run = inFlight(undefined);
	const ran: string[] = [];
	const advanced: number[] = [];
	const action: ActionDescriptor<Person> = {
		...denyAction(ran),
		run: (target) => {
			ran.push(target._id);
			return run.promise;
		},
	};
	function Probe() {
		createActionKeys<Person>({
			scope: "rows",
			actions: () => [action],
			focused: () => person("focused"),
			onAdvance: () => advanced.push(1),
			active: () => true,
		});
		return null;
	}
	render(() => <Probe />);
	fireEvent.keyDown(document, { key: "d" });
	fireEvent.keyDown(document, { key: "d" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(ran).toEqual(["focused"]);
	expect(advanced).toEqual([]);
	run.settle();
	await waitFor(() => {
		expect(advanced).toEqual([1]);
	});
});

/** A form's `hotkey` action in a sheet, with a select whose list is open,
 *  and the press landing on the list. In a browser the list handles the key
 *  and is closed before the key bubbles up to the document; happy-dom applies
 *  Ark's close later, so the list's own listener closes it here, first. */
async function pressOnOpenList(
	hotkey: ActionDescriptor<Person>["hotkey"],
	init: { key: string; ctrlKey?: boolean }
): Promise<string[]> {
	const ran: string[] = [];
	render(() => (
		<Overlay open>
			<ActionKeys<Person>
				scope="form"
				actions={() => [{ ...denyAction(ran), id: "form-key", hotkey }]}
				target={() => person("form")}
				active={() => true}
			/>
			<Select.Root label="Kind" defaultOpen>
				<Select.Option value="a">A</Select.Option>
			</Select.Root>
		</Overlay>
	));
	const list = await waitFor(() => {
		const open = document.querySelector<HTMLElement>(
			'[role="listbox"][data-state="open"]'
		);
		expect(open).not.toBeNull();
		return open!;
	});
	list.addEventListener("keydown", () => {
		list.dataset.state = "closed";
	});
	fireEvent.keyDown(list, init);
	return ran;
}

test("Escape pressed on an open select's list closes the list, not the form", async () => {
	expect(await pressOnOpenList("Escape", { key: "Escape" })).toEqual([]);
});

test("a modifier combo pressed on an open select's list is the list's, though the list closes first", async () => {
	expect(
		await pressOnOpenList("Mod+Enter", { key: "Enter", ctrlKey: true })
	).toEqual([]);
});

/** How many keydown listeners in the capture phase `calls` added or removed
 *  on the window. */
function captureKeydowns(
	calls: Parameters<typeof window.addEventListener>[]
): number {
	return calls.filter(
		([type, , options]) =>
			type === "keydown" &&
			typeof options === "object" &&
			options.capture === true
	).length;
}

test("every binding shares one capture listener, added with the first and removed with the last", () => {
	const add = vi.spyOn(window, "addEventListener");
	const remove = vi.spyOn(window, "removeEventListener");
	try {
		const [count, setCount] = createSignal(3);
		function Probe() {
			createActionKeys<Person>({
				scope: "shared",
				actions: () => [],
				active: () => true,
			});
			return <div />;
		}
		render(() => (
			<For each={Array.from({ length: count() }, (_, index) => index)}>
				{() => <Probe />}
			</For>
		));
		expect(captureKeydowns(add.mock.calls)).toBe(1);
		setCount(1);
		expect(captureKeydowns(remove.mock.calls)).toBe(0);
		setCount(0);
		expect(captureKeydowns(remove.mock.calls)).toBe(1);
		setCount(2);
		expect(captureKeydowns(add.mock.calls)).toBe(2);
	} finally {
		add.mockRestore();
		remove.mockRestore();
	}
});

/** A scope whose one action runs a batch, with `selected` checked rows;
 *  records each batch and each single run. */
function setupBatch(
	selected: () => Person[],
	runBatch: (targets: Person[]) => Promise<ActionOutcome> | undefined
) {
	const singles: string[] = [];
	const batches: string[][] = [];
	const cleared: number[] = [];
	const deny: BatchableAction<Person> = {
		id: "deny",
		label: "Turn down",
		icon: "close",
		hotkey: "D",
		can: (target) => target.deniable,
		run: (target) => {
			singles.push(target._id);
		},
		runBatch: (targets) => {
			batches.push(targets.map((target) => target._id));
			return runBatch(targets);
		},
	};
	function Probe() {
		createActionKeys<Person>({
			scope: "applications",
			actions: () => [deny],
			selected,
			onClearSelection: () => cleared.push(1),
			active: () => true,
		});
		return (
			<ActionButton
				action={batchOf(deny)}
				target={eligible(deny, selected())}
			/>
		);
	}
	render(() => <Probe />);
	return { singles, batches, cleared };
}

test("with rows checked, an action that batches runs once over the rows it applies to, then clears", async () => {
	const { singles, batches, cleared } = setupBatch(
		() => [person("one"), person("no", false), person("two")],
		() => Promise.resolve({ refused: false })
	);
	fireEvent.keyDown(document, { key: "d" });
	await waitFor(() => {
		expect(cleared).toHaveLength(1);
	});
	expect(batches).toEqual([["one", "two"]]);
	expect(singles).toEqual([]);
});

test.each([
	["cancelled", undefined],
	["refused", { refused: true }],
] as const)("a %s batch keeps the selection", async (_name, outcome) => {
	const { batches, cleared } = setupBatch(
		() => [person("one")],
		() => Promise.resolve(outcome)
	);
	fireEvent.keyDown(document, { key: "d" });
	await waitFor(() => {
		expect(batches).toHaveLength(1);
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(cleared).toEqual([]);
});

test("the key and the selection bar's button share one batch run", () => {
	const run = inFlight<ActionOutcome>({ refused: false });
	const { batches } = setupBatch(
		() => [person("one"), person("two")],
		() => run.promise
	);
	fireEvent.keyDown(document, { key: "d" });
	const button = screen.getByRole("button", { name: /Turn down/ });
	expect(button).toHaveAttribute("aria-busy", "true");
	fireEvent.click(button);
	expect(batches).toHaveLength(1);
	run.settle();
});

test("a batch keeps its guard and spinner while its rows land and leave the selection", async () => {
	const run = inFlight<ActionOutcome>({ refused: false });
	const [selected, setSelected] = createSignal([
		person("one"),
		person("two"),
	]);
	const { batches } = setupBatch(
		// eslint-disable-next-line solid/reactivity -- handed on as an accessor, read by the keys and the button
		() => selected(),
		() => run.promise
	);
	fireEvent.keyDown(document, { key: "d" });
	// The first row lands and stops being one the action applies to.
	setSelected([person("one", false), person("two")]);
	const button = screen.getByRole("button", { name: /Turn down/ });
	expect(button).toHaveAttribute("aria-busy", "true");
	fireEvent.keyDown(document, { key: "d" });
	fireEvent.click(button);
	expect(batches).toHaveLength(1);
	run.settle();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy", "true");
	});
});
