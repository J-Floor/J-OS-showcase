import { render } from "@solidjs/testing-library";
import { type Accessor, batch, createEffect, createSignal, on } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import {
	fakeViewTransitions,
	installViewTransitions,
	mockLayoutBoxes,
	namedIds,
	restoreViewTransitions,
	transitionSettled,
} from "../test/viewTransitionFakes.ts";

import { trackActivation } from "./activation.ts";
import { MORPH_HIDDEN, MORPH_PICKED } from "./morphNames.ts";
import {
	type MorphFrom,
	createMorphPresence,
	createMorphHold,
} from "./morphPresence.ts";
import { viewTransition } from "./viewTransition.ts";

/** jsdom loads no stylesheet: a morph source paints its background inline. */
function fill(element: HTMLElement): void {
	element.style.setProperty("background-color", "rgb(0, 0, 0)");
}

afterEach(() => {
	restoreViewTransitions();
	document.body.replaceChildren();
});

function setup(
	isEnabled: boolean | Accessor<boolean> = true,
	closeTarget?: () => HTMLElement | null,
	morphFrom?: MorphFrom
) {
	const [open, setOpen] = createSignal(false);
	let content: HTMLElement | undefined;
	let presence!: ReturnType<typeof createMorphPresence>;
	const { unmount } = render(() => {
		presence = createMorphPresence({
			open,
			enabled:
				typeof isEnabled === "boolean" ? () => isEnabled : isEnabled,
			content: () => content ?? null,
			closeTarget,
			morphFrom,
		});
		return (
			<>
				{/* Filled: a container, which the overlay hides while open. */}
				<button id="opener" ref={fill}>
					Open
				</button>
				<button id="other" ref={fill}>
					Other
				</button>
				<button id="icon">i</button>
				<div
					id="content"
					ref={(element: HTMLElement) => {
						content = element;
					}}
					tabindex="-1"
				/>
			</>
		);
	});
	return { open, setOpen, presence, unmount };
}

function activate(element: HTMLElement | null): void {
	element?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

test("without View Transitions, shown follows open synchronously", () => {
	const { setOpen, presence } = setup();
	setOpen(true);
	expect(presence.shown()).toBe(true);
	setOpen(false);
	expect(presence.shown()).toBe(false);
});

test("hides the source while open and shows it again on close", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	await transitionSettled();
	expect(opener).toHaveAttribute(MORPH_HIDDEN);
	setOpen(false);
	await transitionSettled();
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("an icon source (no container) stays visible while open", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen, presence } = setup();
	const icon = document.getElementById("icon");
	activate(icon);
	setOpen(true);
	await transitionSettled();
	expect(presence.shown()).toBe(true);
	expect(icon).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("without View Transitions the source is never hidden", () => {
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("under reduced motion the source is never hidden", () => {
	installViewTransitions(vi.fn(), { reducedMotion: true });
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("restores focus to the opener after close", async () => {
	const { setOpen } = setup();
	const opener = document.getElementById("opener");
	opener?.focus();
	setOpen(true);
	document.getElementById("content")?.focus();
	setOpen(false);
	await vi.waitFor(() => {
		expect(document.activeElement).toBe(opener);
	});
});

test("morph disabled: no source hiding", () => {
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup(false);
	const opener = document.getElementById("opener");
	opener?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	setOpen(true);
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("unmounting while open shows the source again", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen, unmount } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	await transitionSettled();
	expect(opener).toHaveAttribute(MORPH_HIDDEN);
	unmount();
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("closing with morph switched off shows the source again", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const flag = { enabled: true };
	const { setOpen } = setup(() => flag.enabled);
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	await transitionSettled();
	expect(opener).toHaveAttribute(MORPH_HIDDEN);
	flag.enabled = false;
	setOpen(false);
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("open then close before the transition updates ends closed", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen, presence } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	setOpen(false);
	await transitionSettled();
	expect(presence.shown()).toBe(false);
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("close then reopen before the transition updates ends open", async () => {
	fakeViewTransitions();
	const { setOpen, presence } = setup();
	setOpen(true);
	await transitionSettled();
	expect(presence.shown()).toBe(true);
	setOpen(false);
	setOpen(true);
	await transitionSettled();
	expect(presence.shown()).toBe(true);
});

test("the opener is the source when nothing has focus", async () => {
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	document.getElementById("content")?.focus();
	setOpen(false);
	await vi.waitFor(() => {
		expect(document.activeElement).toBe(opener);
	});
	uninstall();
});

test("focus that moved elsewhere is not stolen on close", async () => {
	fakeViewTransitions();
	const { setOpen, presence } = setup();
	document.getElementById("opener")?.focus();
	setOpen(true);
	await transitionSettled();
	const other = document.getElementById("other");
	other?.focus();
	setOpen(false);
	await transitionSettled();
	expect(presence.shown()).toBe(false);
	expect(document.activeElement).toBe(other);
});

test("the picked mark is cleared after close", async () => {
	fakeViewTransitions();
	const { setOpen } = setup();
	const marked = document.createElement("span");
	marked.setAttribute(MORPH_PICKED, "");
	document.getElementById("content")?.append(marked);
	setOpen(true);
	await transitionSettled();
	setOpen(false);
	await transitionSettled();
	expect(marked).not.toHaveAttribute(MORPH_PICKED);
});

test("the picked mark is cleared after a close with morph switched off", async () => {
	fakeViewTransitions();
	const flag = { enabled: true };
	const { setOpen } = setup(() => flag.enabled);
	const marked = document.createElement("span");
	marked.setAttribute(MORPH_PICKED, "");
	document.getElementById("content")?.append(marked);
	setOpen(true);
	await transitionSettled();
	flag.enabled = false;
	setOpen(false);
	expect(marked).not.toHaveAttribute(MORPH_PICKED);
});

test("closeTarget is used when the source is gone", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const target = document.createElement("div");
	const closeTarget = vi.fn(() => target);
	const { setOpen } = setup(true, closeTarget);
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	await transitionSettled();
	opener?.remove();
	setOpen(false);
	await transitionSettled();
	expect(closeTarget).toHaveBeenCalled();
	uninstall();
});

function setupHandoff(isOpenedInsideClose = true, isHandingOn = false) {
	const [openA, setOpenA] = createSignal(false);
	const [openB, setOpenB] = createSignal(false);
	let contentA: HTMLElement | undefined;
	let contentB: HTMLElement | undefined;
	let presenceA!: ReturnType<typeof createMorphPresence>;
	let presenceB!: ReturnType<typeof createMorphPresence>;
	render(() => {
		presenceA = createMorphPresence({
			open: openA,
			enabled: () => true,
			content: () => contentA ?? null,
			handsOnSource: () => isHandingOn,
		});
		presenceB = createMorphPresence({
			open: openB,
			enabled: () => true,
			content: () => contentB ?? null,
		});
		// B opens inside A's close update, as a palette pick opening a sheet.
		createEffect(
			on(
				presenceA.shown,
				(isShown) => {
					if (!isShown && isOpenedInsideClose) setOpenB(true);
				},
				{ defer: true }
			)
		);
		return (
			<>
				<button id="a-opener" ref={fill}>
					A
				</button>
				<button id="b-source" ref={fill}>
					B
				</button>
				<div
					id="a"
					tabindex="-1"
					ref={(element: HTMLElement) => {
						contentA = element;
					}}
				/>
				<div
					id="b"
					tabindex="-1"
					ref={(element: HTMLElement) => {
						contentB = element;
					}}
				/>
			</>
		);
	});
	return { setOpenA, setOpenB, presenceA, presenceB };
}

/** Records the ids holding a name at each new snapshot. */
function recordNamed(): string[][] {
	const seen: string[][] = [];
	fakeViewTransitions({ onSnapshot: () => seen.push(namedIds()) });
	return seen;
}

test("a closer that hands on its source: the claimant takes its place, closes into it and returns focus where the closer would have", async () => {
	const seen = recordNamed();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpenA, setOpenB, presenceB } = setupHandoff(false, true);
	const opener = document.getElementById("a-opener");
	opener?.focus();
	activate(opener);
	setOpenA(true);
	await transitionSettled();
	document.getElementById("a")?.focus();
	setOpenA(false);
	setOpenB(true);
	await transitionSettled();
	expect(presenceB.shown()).toBe(true);
	expect(opener).toHaveAttribute(MORPH_HIDDEN);
	document.getElementById("b")?.focus();
	setOpenB(false);
	await transitionSettled();
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	// The close's new snapshot: the ghost over the opener, which fades in.
	expect(seen.at(-1)).toContain("a-opener");
	expect(document.activeElement).toBe(opener);
	uninstall();
});

test("a source handed on goes back with the next handoff: the first overlay reopens over it", async () => {
	const seen = recordNamed();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpenA, setOpenB, presenceA } = setupHandoff(false, true);
	const opener = document.getElementById("a-opener");
	activate(opener);
	setOpenA(true);
	await transitionSettled();
	setOpenA(false);
	setOpenB(true);
	await transitionSettled();
	setOpenB(false);
	setOpenA(true);
	await transitionSettled();
	expect(presenceA.shown()).toBe(true);
	expect(opener).toHaveAttribute(MORPH_HIDDEN);
	setOpenA(false);
	await transitionSettled();
	expect(seen.at(-1)).toContain("a-opener");
	uninstall();
});

test("a closer that keeps its source hands nothing on: the claimant opened from nothing", async () => {
	const seen = recordNamed();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpenA, setOpenB } = setupHandoff(false);
	const opener = document.getElementById("a-opener");
	activate(opener);
	setOpenA(true);
	await transitionSettled();
	setOpenA(false);
	setOpenB(true);
	await transitionSettled();
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	setOpenB(false);
	await transitionSettled();
	expect(seen.at(-1)).not.toContain("a-opener");
	uninstall();
});

test("a claimed opener hides no source", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpenA, presenceB } = setupHandoff();
	setOpenA(true);
	await transitionSettled();
	const source = document.getElementById("b-source");
	activate(source);
	setOpenA(false);
	await transitionSettled();
	expect(presenceB.shown()).toBe(true);
	expect(source).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("an overlay opened right after a close, in the same task, claims the handoff", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpenA, setOpenB, presenceB } = setupHandoff(false);
	setOpenA(true);
	await transitionSettled();
	const source = document.getElementById("b-source");
	activate(source);
	setOpenA(false);
	setOpenB(true);
	await transitionSettled();
	expect(presenceB.shown()).toBe(true);
	expect(source).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("a closer whose name was claimed does not restore focus", async () => {
	fakeViewTransitions();
	const { setOpenA, presenceB } = setupHandoff();
	document.getElementById("a-opener")?.focus();
	setOpenA(true);
	await transitionSettled();
	document.getElementById("a")?.focus();
	setOpenA(false);
	await transitionSettled();
	expect(presenceB.shown()).toBe(true);
	expect(document.activeElement).not.toBe(
		document.getElementById("a-opener")
	);
});

async function morphSourceAfterActivatingInside(
	build: (content: HTMLElement) => HTMLElement
): Promise<{ content: HTMLElement; named: HTMLElement | undefined }> {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup();
	const content = document.getElementById("content")!;
	const inner = build(content);
	setOpen(true);
	await transitionSettled();
	activate(inner);
	setOpen(false);
	const named = [content, ...content.querySelectorAll<HTMLElement>("*")].find(
		(element) => element.style.getPropertyValue("view-transition-name")
	);
	await transitionSettled();
	uninstall();
	return { content, named };
}

test("a plain button inside the overlay does not become the close source", async () => {
	const { content, named } = await morphSourceAfterActivatingInside(
		(parent) => {
			const button = document.createElement("button");
			parent.append(button);
			return button;
		}
	);
	expect(named).toBe(content);
});

test("a row inside the overlay becomes the close source", async () => {
	const { named } = await morphSourceAfterActivatingInside((parent) => {
		const row = document.createElement("li");
		const button = document.createElement("button");
		row.append(button);
		parent.append(row);
		return button;
	});
	expect(named?.tagName).toBe("LI");
});

/** A trigger in a list item, and its menu portaled outside the overlay:
 *  the item `build` returns is in that menu, now closed. */
function triggerRowWithClosedMenu(content: HTMLElement): HTMLElement {
	const row = document.createElement("li");
	const trigger = document.createElement("button");
	trigger.setAttribute("aria-controls", "menu");
	trigger.setAttribute("aria-haspopup", "menu");
	row.append(trigger);
	content.append(row);
	const menu = document.createElement("div");
	menu.id = "menu";
	const item = document.createElement("button");
	item.setAttribute("role", "menuitem");
	menu.append(item);
	document.body.append(menu);
	// The pick closes the menu.
	item.addEventListener("pointerdown", () => {
		menu.style.setProperty("visibility", "hidden");
	});
	return item;
}

test("a pick in a popup opened from a row inside the overlay closes from the overlay", async () => {
	const { content, named } = await morphSourceAfterActivatingInside(
		triggerRowWithClosedMenu
	);
	expect(named).toBe(content);
});

test("a direct press on a popup trigger in a row inside the overlay closes from that row", async () => {
	const { named } = await morphSourceAfterActivatingInside((content) => {
		const item = triggerRowWithClosedMenu(content);
		return item.ownerDocument.querySelector<HTMLElement>(
			'[aria-controls="menu"]'
		)!;
	});
	expect(named?.tagName).toBe("LI");
});

test("a request made before the first effect run still opens", () => {
	let presence!: ReturnType<typeof createMorphPresence>;
	render(() => {
		const [open, setOpen] = createSignal(false);
		createEffect(() => {
			setOpen(true);
		});
		presence = createMorphPresence({
			open,
			enabled: () => true,
			content: () => null,
		});
		return null;
	});
	expect(presence.shown()).toBe(true);
});

test("a source inside a popup that has closed closes into the popup's trigger", async () => {
	const names: string[] = [];
	fakeViewTransitions({
		onSnapshot: () => names.push(...namedIds()),
	});
	mockLayoutBoxes();
	const trigger = document.createElement("button");
	trigger.id = "trigger";
	fill(trigger);
	trigger.setAttribute("aria-controls", "popup");
	const popup = document.createElement("div");
	popup.id = "popup";
	const item = document.createElement("button");
	item.id = "item";
	fill(item);
	popup.append(item);
	document.body.append(trigger, popup);
	const { setOpen } = setup(true, undefined, () => item);
	setOpen(true);
	await transitionSettled();
	popup.style.setProperty("visibility", "hidden");
	names.length = 0;
	setOpen(false);
	await transitionSettled();
	expect(names).toContain("trigger");
});

test("unmounting before the open update leaves the source visible", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen, unmount } = setup();
	const opener = document.getElementById("opener");
	activate(opener);
	setOpen(true);
	unmount();
	await transitionSettled();
	expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("close then reopen from another source swaps which one is hidden", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen, presence } = setup();
	const first = document.getElementById("opener");
	const second = document.getElementById("other");
	activate(first);
	setOpen(true);
	await transitionSettled();
	setOpen(false);
	activate(second);
	setOpen(true);
	await transitionSettled();
	expect(presence.shown()).toBe(true);
	expect(first).not.toHaveAttribute(MORPH_HIDDEN);
	expect(second).toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("with no activation, the fallback source is the one that morphs", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup(true, undefined, () =>
		document.getElementById("other")
	);
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("other")).toHaveAttribute(MORPH_HIDDEN);
	expect(document.getElementById("opener")).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("an activation wins over the fallback source", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup(true, undefined, () =>
		document.getElementById("other")
	);
	activate(document.getElementById("opener"));
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("opener")).toHaveAttribute(MORPH_HIDDEN);
	expect(document.getElementById("other")).not.toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

test("a fallback source that is not on screen is ignored", async () => {
	fakeViewTransitions();
	const { setOpen } = setup(true, undefined, () =>
		document.getElementById("other")
	);
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("other")).not.toHaveAttribute(MORPH_HIDDEN);
});

test("of several fallback candidates, the first on screen is the source", async () => {
	fakeViewTransitions();
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
		function mock(this: HTMLElement) {
			return { length: this.id === "other" ? 1 : 0 } as DOMRectList;
		}
	);
	const { setOpen } = setup(true, undefined, () => [
		undefined,
		document.getElementById("opener"),
		document.getElementById("other"),
		document.getElementById("icon"),
	]);
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("other")).toHaveAttribute(MORPH_HIDDEN);
	expect(document.getElementById("opener")).not.toHaveAttribute(MORPH_HIDDEN);
});

test("of fallback candidates both on screen, the earlier one is the source", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const { setOpen } = setup(true, undefined, () => [
		document.getElementById("other"),
		document.getElementById("opener"),
	]);
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("other")).toHaveAttribute(MORPH_HIDDEN);
	expect(document.getElementById("opener")).not.toHaveAttribute(MORPH_HIDDEN);
});

test("a pointerdown on a non-activatable element still uses the fallback", async () => {
	fakeViewTransitions();
	mockLayoutBoxes();
	const uninstall = trackActivation();
	const { setOpen } = setup(true, undefined, () =>
		document.getElementById("other")
	);
	const field = document.createElement("input");
	document.body.append(field);
	activate(field);
	setOpen(true);
	await transitionSettled();
	expect(document.getElementById("other")).toHaveAttribute(MORPH_HIDDEN);
	uninstall();
});

/** A transition whose animation runs until the returned `finish`. */
function runningTransition(): () => void {
	let finish!: () => void;
	installViewTransitions((update: () => unknown) => ({
		updateCallbackDone: Promise.resolve(update()),
		finished: new Promise<void>((resolve) => {
			finish = resolve;
		}),
	}));
	void viewTransition(() => {});
	return () => {
		finish();
	};
}

function holdHarness(settled?: () => Promise<unknown>) {
	const [value, setValue] = createSignal<string | undefined>("a");
	const [live, setLive] = createSignal(true);
	let held!: Accessor<string | undefined>;
	render(() => {
		held = createMorphHold(value, live, settled);
		return null;
	});
	/** Lets go of the value as one change: what a close does. */
	function letGo(): void {
		batch(() => {
			setLive(false);
			setValue(undefined);
		});
	}
	return { held, setValue, setLive, letGo };
}

test("createMorphHold waits for `settled` after the morph, then lets go", async () => {
	let settle!: () => void;
	const settled = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				settle = resolve;
			})
	);
	const { held, letGo } = holdHarness(settled);
	letGo();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(settled).toHaveBeenCalledOnce();
	expect(held()).toBe("a");
	settle();
	await vi.waitFor(() => {
		expect(held()).toBeUndefined();
	});
});

test("createMorphHold follows the value while live", () => {
	const { held, setValue } = holdHarness();
	expect(held()).toBe("a");
	setValue("b");
	expect(held()).toBe("b");
});

test("createMorphHold keeps the last live value until the morph has finished", async () => {
	const { held, letGo } = holdHarness();
	letGo();
	const finish = runningTransition();
	expect(held()).toBe("a");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(held()).toBe("a");
	finish();
	await vi.waitFor(() => {
		expect(held()).toBeUndefined();
	});
});

test("createMorphHold without a transition lets go on the next microtask", async () => {
	const { held, letGo } = holdHarness();
	letGo();
	expect(held()).toBe("a");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(held()).toBeUndefined();
});

test("createMorphHold: an earlier hold's end does not drop a later one", async () => {
	const { held, letGo, setLive, setValue } = holdHarness();
	letGo();
	const finishFirst = runningTransition();
	// Its update done, so the next transition is a new one.
	await transitionSettled();
	batch(() => {
		setValue("b");
		setLive(true);
	});
	letGo();
	const finishSecond = runningTransition();
	finishFirst();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(held()).toBe("b");
	finishSecond();
	await vi.waitFor(() => {
		expect(held()).toBeUndefined();
	});
});
