import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { HotkeysProvider } from "@tanstack/solid-hotkeys";
import { createSignal } from "solid-js";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	onTestFinished,
	vi,
} from "vitest";

import {
	fakeViewTransitions,
	mockLayoutBoxes,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { trackActivation } from "../../utils/activation.ts";
import {
	MORPH_HIDDEN,
	createMorphPresence,
} from "../../utils/morphPresence.ts";

import { CommandPalette, type CommandPaletteItem } from "./CommandPalette.tsx";

// Ark's Combobox measures its trigger; jsdom has no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const onSelect = vi.fn();

function items(): CommandPaletteItem[] {
	return [
		{
			value: "page:tasks",
			label: "Tasks",
			group: "Pages",
			onSelect,
		},
		{
			value: "p:ada",
			label: "Ada Lovelace",
			group: "People",
			keywords: ["ada@example.com"],
			onSelect,
		},
		{
			value: "p:grace",
			label: "Grace Hopper",
			group: "People",
			onSelect,
		},
	];
}

/**
 * Types into the palette and waits for the result.
 *
 * zag processes the input event on its own queue, so `onInputValueChange` —
 * and therefore the filtering — lands a tick after `fireEvent` returns. A
 * synchronous assertion here reads the unfiltered list and passes for the
 * wrong reason.
 */
/**
 * The labels currently listed.
 *
 * Read off the rendered rows rather than with `getByText`, because a
 * highlighted match splits the label across a `<mark>` and its siblings —
 * "Ada Lovelace" is three nodes once you have typed "ada".
 */
function labels(): (string | null)[] {
	return Array.from(
		document.querySelectorAll(
			'[data-scope="combobox"][data-part="item-text"]'
		)
	).map((element) => element.textContent);
}

async function type(value: string): Promise<void> {
	const input = screen.getByRole("combobox");
	fireEvent.input(input, { target: { value } });
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	onSelect.mockClear();
	localStorage.clear();
});
afterEach(() => {
	localStorage.clear();
});

describe("CommandPalette", () => {
	it("shows everything, grouped, before anything is typed", () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		expect(screen.getByText("Pages")).toBeInTheDocument();
		expect(screen.getByText("People")).toBeInTheDocument();
		expect(screen.getByText("Tasks")).toBeInTheDocument();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	});

	it("narrows to a real substring match, not a fuzzy one", async () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		await type("ada");
		// "Tasks" contains a, s and k in order — a fuzzy matcher would keep it.
		expect(labels()).toEqual(["Ada Lovelace"]);
	});

	it("finds someone by a keyword they are not named after", async () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		await type("ada@example.com");
		expect(labels()).toEqual(["Ada Lovelace"]);
	});

	it("says so when nothing matches, rather than showing an empty box", async () => {
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={items()}
				emptyMessage="Nothing here."
			/>
		));
		await type("zzzzz");
		expect(screen.getByText("Nothing here.")).toBeInTheDocument();
	});

	it("offers what was chosen last, and only on a blank search", async () => {
		localStorage.setItem("test:recents", JSON.stringify(["p:grace"]));
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={items()}
				recentsKey="test:recents"
			/>
		));
		expect(screen.getByText("Recent")).toBeInTheDocument();
		// Once, under Recent — not also under People. Ark keys rows by value, so
		// a duplicate would highlight both copies and make arrowing down look
		// like it had stalled.
		expect(
			labels().filter((label) => label === "Grace Hopper")
		).toHaveLength(1);
		expect(labels()[0]).toBe("Grace Hopper");

		// Once you are searching you want the thing, not your history — and a
		// duplicated row in a keyboard list is a row you can land on twice.
		await type("grace");
		expect(screen.queryByText("Recent")).toBeNull();
		expect(labels()).toEqual(["Grace Hopper"]);
	});

	it("runs the same item again when it is picked a second time", async () => {
		const [open, setOpen] = createSignal(true);
		render(() => (
			<CommandPalette
				open={open()}
				onOpenChange={setOpen}
				items={items()}
			/>
		));

		async function pickAda(): Promise<void> {
			setOpen(true);
			await new Promise((resolve) => setTimeout(resolve, 0));
			await type("ada");
			fireEvent.click(
				screen.getByRole("option", { name: /Ada Lovelace/ })
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		await pickAda();
		await pickAda();
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it("does not touch localStorage without a recents key", () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		expect(screen.queryByText("Recent")).toBeNull();
		expect(localStorage).toHaveLength(0);
	});

	it("offers a clear button only once there is something to clear", async () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		expect(screen.queryByLabelText("Clear search")).toBeNull();

		await type("ada");
		const clear = screen.getByLabelText("Clear search");

		// It clears the field, it does not close the palette — an X beside a
		// search box that threw away the whole dialog would be a trap.
		fireEvent.click(clear);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(labels()).toHaveLength(items().length);
	});

	it("highlights why a row matched", async () => {
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={items()} />
		));
		// Lowercase against a capitalised name — the case that silently
		// highlighted nothing until `ignoreCase` was set.
		await type("ada");
		const marks = document.querySelectorAll("mark");
		expect(marks.length).toBeGreaterThan(0);
		expect(marks[0].textContent).toBe("Ada");
	});

	it("keeps `searchOnly` items out of the blank palette and offers them once you type", async () => {
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={[
					...items(),
					{
						value: "p:alan",
						label: "Alan Turing",
						group: "People",
						searchOnly: true,
						onSelect,
					},
				]}
			/>
		));
		// Every person in the place is not a browsable list — and each row is a
		// live listbox option, so an unfiltered dump is DOM nobody asked for.
		expect(labels()).not.toContain("Alan Turing");

		await type("alan");
		expect(labels()).toEqual(["Alan Turing"]);
	});

	it("still offers a `searchOnly` item you reached for last time", () => {
		localStorage.setItem("test:recents", JSON.stringify(["p:alan"]));
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				recentsKey="test:recents"
				items={[
					...items(),
					{
						value: "p:alan",
						label: "Alan Turing",
						group: "People",
						searchOnly: true,
						onSelect,
					},
				]}
			/>
		));
		// Recents are the exception the gate exists for: what you used last is
		// exactly what a blank palette should put in front of you.
		expect(screen.getByText("Recent")).toBeInTheDocument();
		expect(labels()[0]).toBe("Alan Turing");
	});

	it("caps a long group and says how many it left out", async () => {
		const many: CommandPaletteItem[] = Array.from(
			{ length: 12 },
			(_unused, index) => ({
				value: `p:${String(index)}`,
				label: `Ada ${String(index)}`,
				group: "People",
				onSelect,
			})
		);
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={many}
				maxPerGroup={3}
			/>
		));
		await type("ada");
		expect(labels()).toEqual(["Ada 0", "Ada 1", "Ada 2"]);
		// The heading owns up to the cut, so a capped list reads as "keep
		// typing" rather than "that is everyone".
		expect(screen.getByText(/3 of 12/)).toBeInTheDocument();
		// And the rows Ark can highlight are the rows that exist: an option in
		// the collection but not in the DOM is an arrow-key stop on nothing.
		expect(
			document.querySelectorAll(
				'[data-scope="combobox"][data-part="item"]'
			)
		).toHaveLength(3);
	});

	it("shows the top of the list when the highlight is on the first row", async () => {
		// Not `scrollIntoView`: a heading sits above that row and is not part of
		// it, and asking the browser to scroll a row into view WHILE the dialog
		// is still animating in measured a rect the animation had displaced —
		// so the palette opened already scrolled past its own first result.
		// Only reproducible with enough results to scroll, which is why it
		// showed up in production and not on a dev roster.
		const original = Object.getOwnPropertyDescriptor(
			Element.prototype,
			"scrollIntoView"
		);
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		try {
			render(() => (
				<CommandPalette open onOpenChange={() => {}} items={items()} />
			));
			scrollIntoView.mockClear();
			await type("grace");
			await new Promise((resolve) => setTimeout(resolve, 0));

			// One match, so it is the first row — and the first row is scrolled
			// to by moving the list, not by measuring anything.
			expect(labels()).toEqual(["Grace Hopper"]);
			expect(scrollIntoView).not.toHaveBeenCalled();
		} finally {
			if (original === undefined) {
				delete (Element.prototype as { scrollIntoView?: unknown })
					.scrollIntoView;
			} else {
				Object.defineProperty(
					Element.prototype,
					"scrollIntoView",
					original
				);
			}
		}
	});

	it("scrolls a row further down into view when the highlight moves to it", async () => {
		// The case the scrolling exists for at all: zag scrolls the highlight
		// into view itself, but only inside `Combobox.Content`, and this palette
		// renders `Combobox.List` — so arrowing past the bottom row moved the
		// highlight off-screen and the list never followed.
		const original = Object.getOwnPropertyDescriptor(
			Element.prototype,
			"scrollIntoView"
		);
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		try {
			render(() => (
				<CommandPalette open onOpenChange={() => {}} items={items()} />
			));
			scrollIntoView.mockClear();

			const input = screen.getByRole("combobox");
			fireEvent.keyDown(input, { key: "ArrowDown" });
			await new Promise((resolve) => setTimeout(resolve, 0));

			const highlighted = document.querySelector("[data-highlighted]");
			// Guard the premise: if the arrow key did not move the highlight off
			// the first row, this test would pass without exercising anything.
			expect(highlighted?.getAttribute("data-value")).not.toBe(
				items()[0].value
			);
			expect(scrollIntoView).toHaveBeenCalled();
		} finally {
			if (original === undefined) {
				delete (Element.prototype as { scrollIntoView?: unknown })
					.scrollIntoView;
			} else {
				Object.defineProperty(
					Element.prototype,
					"scrollIntoView",
					original
				);
			}
		}
	});

	it("highlights the first row, so Enter opens the obvious answer", async () => {
		const onSelect2 = vi.fn();
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={[
					{
						value: "p:ada",
						label: "Ada Lovelace",
						group: "People",
						onSelect: onSelect2,
					},
					...items(),
				]}
			/>
		));
		await type("ada");
		const highlighted = document.querySelector("[data-highlighted]");
		expect(highlighted?.textContent).toContain("Ada Lovelace");
	});
});

/**
 * The shortcut that opens the palette.
 *
 * This is the one behaviour the move to `@tanstack/solid-hotkeys` actually
 * changed — the hand-rolled `matchesShortcut` listener it replaced was covered
 * by that module's own unit tests, which were deleted along with it, so
 * without this the binding has no coverage at all.
 *
 * Both modifiers are dispatched because `Mod` resolves per platform — Meta on
 * macOS, Control everywhere else — and this suite has to pass on both. Exactly
 * one of the two is expected to match, which is also what pins the platform
 * resolution: if `Mod` ever matched both, or neither, the count moves off one.
 */
describe("the open shortcut", () => {
	it("opens on Mod+K, on whichever modifier this platform uses", () => {
		const onOpenChange = vi.fn();
		render(() => (
			<CommandPalette
				open={false}
				onOpenChange={onOpenChange}
				items={items()}
			/>
		));
		fireEvent.keyDown(document, { key: "k", metaKey: true });
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(true);
	});

	it("ignores a bare k", () => {
		const onOpenChange = vi.fn();
		render(() => (
			<CommandPalette
				open={false}
				onOpenChange={onOpenChange}
				items={items()}
			/>
		));
		fireEvent.keyDown(document, { key: "k" });
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("opens from a text field even under an app that ignores inputs by default", () => {
		const onOpenChange = vi.fn();
		// A hostile default: an app-level provider that would swallow shortcuts in
		// inputs. The palette opens from anywhere, so it must set
		// `ignoreInputs: false` itself and override this. Without that, the combo
		// is dropped while the field has focus and this fails.
		render(() => (
			<HotkeysProvider
				defaultOptions={{ hotkey: { ignoreInputs: true } }}
			>
				<CommandPalette
					open={false}
					onOpenChange={onOpenChange}
					items={items()}
				/>
			</HotkeysProvider>
		));
		const field = document.createElement("input");
		document.body.append(field);
		field.focus();
		// Fire both modifiers: `Mod` resolves to Ctrl off Apple, Meta on it.
		fireEvent.keyDown(field, { key: "k", metaKey: true });
		fireEvent.keyDown(field, { key: "k", ctrlKey: true });
		expect(onOpenChange).toHaveBeenCalledWith(true);
		field.remove();
	});
});

describe("while closed", () => {
	// The palette stays mounted while closed (an overlay cannot gate its own
	// mount). It used to run an ALWAYS-open combobox inside that closed dialog,
	// and Ark focuses an open combobox's input on mount — so on every page load
	// focus was pulled into the hidden search box, and the roster's arrow keys
	// drove the palette instead of the table's row focus (Alt-to-peek too). The
	// combobox now tracks the dialog's open state.
	//
	// The symptom is a focus steal, but that is asserted through `aria-expanded`,
	// not `document.activeElement`: jsdom lays nothing out and does not replay
	// Ark's focus-on-open, so a focus assertion passes against the broken build
	// too — a test that cannot fail. The combobox's open state is the cause the
	// focus steal follows from, and it IS reflected deterministically.
	it("keeps its combobox closed, so it captures no keystrokes", () => {
		render(() => (
			<CommandPalette
				open={false}
				onOpenChange={() => {}}
				items={items()}
			/>
		));
		const input = document.querySelector(
			'[data-scope="combobox"][data-part="input"]'
		);
		// The combobox was hardcoded `open`, so a closed palette still ran an open
		// combobox that arrow keys drove; the input's `aria-expanded` reads "true"
		// against that build. Tying `open` to the dialog closes it: "false".
		expect(input?.getAttribute("aria-expanded")).toBe("false");
	});
});

/*
 * NOT TESTED HERE: that opening the palette puts the caret in the search field
 * (`initialFocusEl` on its `Dialog.Root`).
 *
 * jsdom never runs the real focus trap — `tabbable` treats a zero-size element
 * as untabbable, and jsdom lays nothing out — so the open-focus path cannot be
 * exercised here. Verified in Chrome: ⌘K (or opening a row's sheet), then
 * `document.activeElement` is the combobox input, and typing filters the list.
 */

function withSpies() {
	const firstAction = vi.fn();
	const secondAction = vi.fn();
	const list: CommandPaletteItem[] = [
		{
			value: "p:ada",
			label: "Ada Lovelace",
			group: "People",
			onSelect,
			onHighlight: firstAction,
		},
		{
			value: "p:adam",
			label: "Adam Smith",
			group: "People",
			onSelect,
			onHighlight: secondAction,
		},
	];
	return { a: firstAction, b: secondAction, list };
}

describe("onHighlight", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires once per stable highlight after the intent delay", async () => {
		vi.useFakeTimers();
		const { a, b, list } = withSpies();
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={list} />
		));
		const input = screen.getByRole("combobox");
		fireEvent.input(input, { target: { value: "ada" } });
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(120);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).not.toHaveBeenCalled();

		fireEvent.keyDown(input, { key: "ArrowDown" });
		await vi.advanceTimersByTimeAsync(119);
		expect(b).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(b).toHaveBeenCalledTimes(1);
		expect(a).toHaveBeenCalledTimes(1);
	});

	it("does not fire for the auto-highlighted row of a blank palette", async () => {
		vi.useFakeTimers();
		const { a, b, list } = withSpies();
		render(() => (
			<CommandPalette open onOpenChange={() => {}} items={list} />
		));
		await vi.advanceTimersByTimeAsync(500);
		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();

		fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
		await vi.advanceTimersByTimeAsync(200);
		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
	});
});

/** Opens and closes the palette out of the compact search icon (a bare
 *  button: no container), clicked or as the ⌘K fallback. */
async function openFromCompactIcon(isClicked: boolean) {
	type Snapshot = { kinds: string; iconName: string; ghosts: number };
	const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
	function take(): Snapshot {
		return {
			kinds: document.documentElement.dataset.vt ?? "",
			iconName:
				document
					.getElementById("compact")
					?.style.getPropertyValue("view-transition-name") ?? "",
			ghosts: document.querySelectorAll("[data-morph-ghost]").length,
		};
	}
	fakeViewTransitions({
		onStart: () => seen.old.push(take()),
		onSnapshot: () => seen.new.push(take()),
	});
	mockLayoutBoxes();
	const uninstall = trackActivation();
	onTestFinished(() => {
		uninstall();
		restoreViewTransitions();
	});
	const [open, setOpen] = createSignal(false);
	render(() => (
		<>
			<button
				id="compact"
				style={{ "background-color": "transparent", border: "0" }}
			>
				search
			</button>
			<CommandPalette
				open={open()}
				onOpenChange={setOpen}
				items={[]}
				morphFrom={() => document.getElementById("compact")}
			/>
		</>
	));
	await new Promise((resolve) => setTimeout(resolve, 5));
	const icon = document.getElementById("compact");
	if (isClicked) {
		icon?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	}
	setOpen(true);
	await transitionSettled();
	expect(icon).not.toHaveAttribute(MORPH_HIDDEN);
	setOpen(false);
	await transitionSettled();
	return seen;
}

describe("CommandPalette morph look", () => {
	it("with no source, opens and closes with the box look (from and to the centre)", async () => {
		const kinds: string[] = [];
		fakeViewTransitions({
			onSnapshot: () =>
				kinds.push(document.documentElement.dataset.vt ?? ""),
		});
		mockLayoutBoxes();
		onTestFinished(restoreViewTransitions);
		const [open, setOpen] = createSignal(false);
		render(() => (
			<CommandPalette open={open()} onOpenChange={setOpen} items={[]} />
		));
		await new Promise((resolve) => setTimeout(resolve, 5));
		setOpen(true);
		await transitionSettled();
		setOpen(false);
		await transitionSettled();
		expect(kinds).toEqual(["morph morph-box", "morph morph-box"]);
	});

	for (const [how, isClicked] of [
		["clicked", true],
		["as the ⌘K fallback", false],
	] as const) {
		it(`out of the compact icon (${how}) the palette grows out of its box, not scaled`, async () => {
			const seen = await openFromCompactIcon(isClicked);
			const kinds = seen.new.map((snapshot) => snapshot.kinds.split(" "));
			expect(kinds[0]).toContain("morph-grow");
			expect(kinds[1]).toContain("morph-shrink");
			for (const snapshotKinds of kinds) {
				expect(snapshotKinds).not.toContain("morph-scale");
			}
			// The icon stays live: a ghost of its box carries the morph.
			for (const snapshot of [seen.old[0], seen.new[1]]) {
				expect(snapshot.iconName).toBe("");
				expect(snapshot.ghosts).toBe(1);
			}
		});
	}

	// Pins the user-approved palette morph: the surface morph of the box look
	// (ghost, jf-morph-source, value flights, surface kinds) never touches it.
	it("opens out of its field and closes back into it, unchanged by the surface morph", async () => {
		type Snapshot = { names: string[]; kinds: string; ghosts: number };
		const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
		function take(): Snapshot {
			return {
				names: [...document.querySelectorAll<HTMLElement>("*")]
					.map((element) => {
						const name = element.style.getPropertyValue(
							"view-transition-name"
						);
						const who =
							element.id === "field" ? "field" : "palette";
						return name ? `${who}:${name}` : "";
					})
					.filter(Boolean),
				kinds: document.documentElement.dataset.vt ?? "",
				ghosts: document.querySelectorAll("[data-morph-ghost]").length,
			};
		}
		fakeViewTransitions({
			onStart: () => seen.old.push(take()),
			onSnapshot: () => seen.new.push(take()),
		});
		mockLayoutBoxes();
		onTestFinished(restoreViewTransitions);
		const [open, setOpen] = createSignal(false);
		render(() => (
			<>
				<input
					id="field"
					style={{
						"background-color": "rgb(1, 2, 3)",
						border: "1px solid rgb(0, 0, 0)",
					}}
				/>
				<CommandPalette
					open={open()}
					onOpenChange={setOpen}
					items={[]}
					morphFrom={() => document.getElementById("field")}
				/>
			</>
		));
		await new Promise((resolve) => setTimeout(resolve, 5));
		const field = document.getElementById("field");
		setOpen(true);
		await transitionSettled();
		expect(field).toHaveAttribute(MORPH_HIDDEN);
		setOpen(false);
		await transitionSettled();
		expect(field).not.toHaveAttribute(MORPH_HIDDEN);
		expect(seen.old.map((snapshot) => snapshot.names)).toEqual([
			["field:jf-morph"],
			["palette:jf-morph"],
		]);
		expect(seen.new.map((snapshot) => snapshot.names)).toEqual([
			["palette:jf-morph"],
			["field:jf-morph"],
		]);
		for (const snapshot of [...seen.old, ...seen.new]) {
			expect(snapshot.ghosts).toBe(0);
		}
		expect(seen.new.map((snapshot) => snapshot.kinds)).toEqual([
			"morph morph-scale",
			"morph morph-scale",
		]);
		expect(
			document.documentElement.style.getPropertyValue(
				"--jf-morph-from-background"
			)
		).toBe("");
	});
});

describe("CommandPalette morph handoff", () => {
	it("a pick closes first and then runs onSelect", async () => {
		const calls: string[] = [];
		const [open, setOpen] = createSignal(true);
		render(() => (
			<CommandPalette
				open={open()}
				onOpenChange={(next) => {
					calls.push(`open:${String(next)}`);
					setOpen(next);
				}}
				items={[
					{
						value: "a",
						label: "Alpha",
						group: "Pages",
						onSelect: () => calls.push("select"),
					},
				]}
			/>
		));
		fireEvent.click(await screen.findByText("Alpha"));
		await waitFor(() => {
			expect(calls).toEqual(["open:false", "select"]);
		});
	});

	it("a pick marks the row as the morph source", async () => {
		render(() => (
			<CommandPalette
				open
				onOpenChange={() => {}}
				items={[
					{
						value: "a",
						label: "Alpha",
						group: "Pages",
						onSelect,
					},
				]}
			/>
		));
		fireEvent.click(await screen.findByText("Alpha"));
		await waitFor(() => {
			expect(
				screen.getByText("Alpha").closest("[data-morph-from]")
			).not.toBeNull();
		});
	});

	it("onSelect runs inside the close, and what it opens claims the handoff", async () => {
		const rowNames: string[] = [];
		const kinds: string[] = [];
		fakeViewTransitions({
			onSnapshot: () =>
				kinds.push(document.documentElement.dataset.vt ?? ""),
			// The old snapshot: the picked row must hold the name.
			onStart: () =>
				rowNames.push(
					document
						.querySelector<HTMLElement>("[data-morph-from]")
						?.style.getPropertyValue("view-transition-name") ??
						"none"
				),
		});
		mockLayoutBoxes();
		const uninstall = trackActivation();
		const [open, setOpen] = createSignal(false);
		const [sheetOpen, setSheetOpen] = createSignal(false);
		let sheetContent: HTMLElement | undefined;
		let sheet!: ReturnType<typeof createMorphPresence>;
		onTestFinished(() => {
			uninstall();
			restoreViewTransitions();
		});
		render(() => {
			sheet = createMorphPresence({
				open: sheetOpen,
				enabled: () => true,
				content: () => sheetContent ?? null,
			});
			return (
				<>
					<button id="source">Source</button>
					{/* The desktop search field the palette opens out of. */}
					<input
						id="field"
						style={{ border: "1px solid rgb(0, 0, 0)" }}
					/>
					<div
						id="sheet"
						tabindex="-1"
						ref={(element: HTMLElement) => {
							sheetContent = element;
						}}
					/>
					<CommandPalette
						open={open()}
						onOpenChange={setOpen}
						morphFrom={() => document.getElementById("field")}
						items={[
							{
								value: "a",
								label: "Alpha",
								group: "Pages",
								onSelect: () => {
									setSheetOpen(true);
								},
							},
						]}
					/>
				</>
			);
		});
		setOpen(true);
		const row = await screen.findByText("Alpha");
		await transitionSettled();
		document
			.getElementById("source")
			?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		fireEvent.click(row);
		await waitFor(() => {
			expect(sheet.shown()).toBe(true);
		});
		expect(rowNames).toContain("jf-morph");
		expect(document.getElementById("source")).not.toHaveAttribute(
			MORPH_HIDDEN
		);
		// The palette opened with its own look; the pick into a (box) sheet
		// takes the sheet's: the target decides.
		await transitionSettled();
		expect(kinds).toEqual(["morph morph-scale", "morph morph-box"]);
	});
});
