// @vitest-environment happy-dom
import { compile } from "sass";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import {
	captureSurfaced,
	fakeViewTransitions,
	installViewTransitions,
	namedIds,
	restoreViewTransitions,
} from "../test/viewTransitionFakes.ts";

import {
	claimHandoff,
	hasContainer,
	joinHandoff,
	morph,
	paintedBox,
} from "./morph.ts";
import {
	BOX_CLASS,
	BOX_SLOT_VARS,
	GHOST_GEOMETRY_VARS,
	MORPH_BOX_SLOTS,
	MORPH_GHOST,
	MORPH_KEY,
	MORPH_LAYER,
	MORPH_OF,
	MORPH_PINNED,
	MORPH_PINNED_SELECTOR,
	MORPH_SCRIM,
	MORPH_TITLE,
	SOURCE_CLIP_VAR,
	SURFACE_FROM_VARS,
	SURFACE_TO_VARS,
	boxSlotClass,
} from "./morphNames.ts";
import { SHEET_SKELETON } from "./morphPairing.ts";
import {
	PART_CLASS,
	STACKED_CLASS,
	stackedName,
	viewTransition,
} from "./viewTransition.ts";

/** The named elements at each new snapshot. */
function fakeTransitions(): string[][] {
	const seen: string[][] = [];
	fakeViewTransitions({ onSnapshot: () => seen.push(namedIds()) });
	return seen;
}

function element(id: string): HTMLElement {
	const node = document.createElement("div");
	node.id = id;
	document.body.append(node);
	return node;
}

afterEach(() => {
	restoreViewTransitions();
	document.body.replaceChildren();
});

test("the name moves from the source to the target, never on both", async () => {
	const seen = fakeTransitions();
	const from = element("from");
	const to = element("to");
	expect.assertions(3);
	await morph({
		from,
		to: () => to,
		update: () => {
			expect(from.style.getPropertyValue("view-transition-name")).toBe(
				""
			);
		},
	});
	expect(seen).toEqual([["to"]]);
	expect(to.style.getPropertyValue("view-transition-name")).toBe("");
});

test("an overlay opening inside a closing one takes over its name", async () => {
	const seen = fakeTransitions();
	const palette = element("palette");
	const searchField = element("search");
	const sheet = element("sheet");
	await morph({
		from: palette,
		to: () => searchField,
		direction: "close",
		update: () => {
			const wasClaimed = claimHandoff(() => sheet) !== null;
			expect(wasClaimed).toBe(true);
			void joinHandoff(() => {});
		},
	});
	expect(seen).toEqual([["sheet"]]);
});

test("a close hands on what it was given to the overlay that claims its handoff", async () => {
	fakeTransitions();
	const source = element("source");
	const opener = element("opener");
	const claims: unknown[] = [];
	await morph({
		from: element("sheet"),
		to: () => null,
		direction: "close",
		handsOn: { source, opener },
		update: () => {
			claims.push(claimHandoff(() => element("dialog")));
			void joinHandoff(() => {});
		},
	});
	expect(claims).toEqual([{ handedOn: { source, opener } }]);
});

test("two morphs in one session end with exactly one jf-morph", async () => {
	const seen = fakeTransitions();
	vi.spyOn(console, "warn").mockImplementation(() => {});
	const first = element("first");
	const second = element("second");
	await morph({
		from: null,
		to: () => first,
		update: () => {
			void morph({ from: null, to: () => second, update: () => {} });
		},
	});
	expect(seen).toEqual([["first"]]);
});

test("an overlay opened right after a close, in the same task, takes over its name", async () => {
	const seen = fakeTransitions();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const bell = element("bell");
	const row = element("row");
	const sheet = element("sheet");
	const closing = morph({
		from: row,
		to: () => bell,
		direction: "close",
		update: () => {},
	});
	const wasClaimed = claimHandoff(() => sheet) !== null;
	expect(wasClaimed).toBe(true);
	void joinHandoff(() => {});
	await expect(closing).resolves.toEqual({ handedOff: true });
	expect(seen).toEqual([["sheet"]]);
	expect(warn).not.toHaveBeenCalled();
});

test("an opener that did not claim still names its target after another claimed", async () => {
	const seen = fakeTransitions();
	const palette = element("palette");
	const sheet = element("sheet");
	await morph({
		from: palette,
		to: () => null,
		direction: "close",
		update: () => {
			const wasClaimed = claimHandoff(() => null) !== null;
			expect(wasClaimed).toBe(true);
			void joinHandoff(() => {});
			void morph({ from: null, to: () => sheet, update: () => {} });
		},
	});
	expect(seen).toEqual([["sheet"]]);
});

test("a later transition cannot claim an earlier closer's handoff", async () => {
	fakeTransitions();
	const palette = element("palette");
	await morph({
		from: palette,
		to: () => null,
		direction: "close",
		update: () => {},
	});
	expect(claimHandoff(() => palette)).toBeNull();
	let wasClaimed: boolean | undefined;
	await viewTransition(() => {
		wasClaimed = claimHandoff(() => palette) !== null;
	});
	expect(wasClaimed).toBe(false);
});

test("without the API it only runs the update", async () => {
	const update = vi.fn();
	await morph({ from: element("a"), to: () => element("b"), update });
	expect(update).toHaveBeenCalledTimes(1);
});

/** The named elements at each old and new snapshot, and data-vt at each new one. */
function recordBothSnapshots() {
	const seen = {
		old: [] as string[][],
		new: [] as string[][],
		kinds: [] as string[],
	};
	fakeViewTransitions({
		onStart: () => seen.old.push(namedIds()),
		onSnapshot: () => {
			seen.new.push(namedIds());
			seen.kinds.push(document.documentElement.dataset.vt ?? "");
		},
	});
	return seen;
}

function withTitle(id: string, titleId: string): HTMLElement {
	const node = element(id);
	const title = document.createElement("span");
	title.id = titleId;
	title.setAttribute(MORPH_TITLE, "");
	node.append(title);
	return node;
}

/** A table row: a container, so its ghost ("") is named in the old
 *  snapshot and the row itself is `jf-morph-source`. */
function asRow(node: HTMLElement): HTMLElement {
	node.setAttribute("role", "row");
	return node;
}

test("a marked title flies from the source's title to the target's", async () => {
	const seen = recordBothSnapshots();
	const row = asRow(withTitle("row", "cell"));
	const sheet = withTitle("sheet", "title");
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old).toEqual([["row", "cell", ""]]);
	expect(seen.new).toEqual([["sheet", "title"]]);
});

test("a title whose target has none is in the old snapshot only: it leaves with its source", async () => {
	const seen = recordBothSnapshots();
	const row = asRow(withTitle("row", "cell"));
	const sheet = element("sheet");
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old).toEqual([["row", "cell", ""]]);
	expect(seen.new).toEqual([["sheet"]]);
});

test("no title flight when the source has no marked title", async () => {
	const seen = recordBothSnapshots();
	const row = asRow(element("row"));
	const sheet = withTitle("sheet", "title");
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old).toEqual([["row", ""]]);
	expect(seen.new).toEqual([["sheet"]]);
});

test("a target rendered by the update still gets the title flight", async () => {
	const seen = recordBothSnapshots();
	const row = asRow(withTitle("row", "cell"));
	let sheet: HTMLElement | null = null;
	await morph({
		from: row,
		to: () => sheet,
		update: () => {
			sheet = withTitle("sheet", "title");
		},
	});
	expect(seen.old).toEqual([["row", "cell", ""]]);
	expect(seen.new).toEqual([["sheet", "title"]]);
});

test("bare ends take the box look", async () => {
	const seen = recordBothSnapshots();
	await morph({
		from: element("a"),
		to: () => element("b"),
		update: () => {},
	});
	// a and b are bare: the box look also draws b's surface out of a's box.
	expect(seen.kinds).toEqual(["morph morph-box morph-grow"]);
});

test("the handed-off target decides the look, not the closer", async () => {
	const seen = recordBothSnapshots();
	const sheet = element("sheet");
	// Closing into a text field would take the scale look on its own.
	const field = textField("field");
	await morph({
		from: element("row"),
		to: () => field,
		direction: "close",
		update: () => {
			expect(claimHandoff(() => sheet)).not.toBeNull();
			void joinHandoff(() => {});
		},
	});
	expect(seen.new).toEqual([["sheet"]]);
	expect(seen.kinds).toEqual(["morph morph-box morph-handoff"]);
});

test("without the API a close offers no handoff to the next call", async () => {
	const closing = morph({
		from: element("row"),
		to: () => null,
		direction: "close",
		update: () => {},
	});
	let wasClaimed: boolean | undefined;
	const next = morph({
		from: null,
		to: () => null,
		direction: "close",
		update: () => {
			wasClaimed = claimHandoff(() => element("sheet")) !== null;
		},
	});
	await expect(closing).resolves.toEqual({ handedOff: false });
	await expect(next).resolves.toEqual({ handedOff: false });
	expect(wasClaimed).toBe(false);
});

// --- Morph v3: the surface morph (box look) ---------------------------------

const FILLED = "background-color: rgb(10, 20, 30); border-radius: 4px";
const CARD =
	"background-color: rgb(250, 250, 250); border: 2px solid rgb(1, 2, 3); border-radius: 12px";

function styled(id: string, style: string, tag = "div"): HTMLElement {
	const node = document.createElement(tag);
	node.id = id;
	node.setAttribute("style", style);
	document.body.append(node);
	return node;
}

/** The name each element holds, by name ("ghost" for the ghost). */
function heldNames(): Record<string, string> {
	const held: Record<string, string> = {};
	for (const node of document.querySelectorAll<HTMLElement>("*")) {
		const name = node.style.getPropertyValue("view-transition-name");
		if (!name) continue;
		held[name] = node.hasAttribute(MORPH_GHOST) ? "ghost" : node.id;
	}
	return held;
}

/** Each element's id and its view-transition class, for those with one. */
function heldClasses(): Record<string, string> {
	const held: Record<string, string> = {};
	for (const node of document.querySelectorAll<HTMLElement>("*")) {
		const value = node.style.getPropertyValue("view-transition-class");
		if (value) held[node.id] = value;
	}
	return held;
}

function rootVariable(name: string): string {
	return document.documentElement.style.getPropertyValue(name);
}

/** Names, data-vt, the surface vars and the ghost at each snapshot. */
function recordSurface() {
	type Snapshot = {
		names: Record<string, string>;
		kinds: string;
		from: string;
		to: string;
		ghosts: number;
		pins: number;
		classes: Record<string, string>;
	};
	const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
	function take(): Snapshot {
		return {
			names: heldNames(),
			kinds: document.documentElement.dataset.vt ?? "",
			from: rootVariable(SURFACE_FROM_VARS.background),
			to: rootVariable(SURFACE_TO_VARS.background),
			ghosts: document.querySelectorAll(`[${MORPH_GHOST}]`).length,
			pins: document.querySelectorAll(`[${MORPH_PINNED}]`).length,
			classes: heldClasses(),
		};
	}
	fakeViewTransitions({
		onStart: () => seen.old.push(take()),
		onSnapshot: () => seen.new.push(take()),
	});
	return seen;
}

test("hasContainer: a table row is a container", () => {
	const row = element("row");
	row.setAttribute("role", "row");
	expect(hasContainer(row)).toBe(true);
});

test("hasContainer: a bordered button is a container", () => {
	const button = styled("b", "border: 1px solid rgb(0, 0, 0)", "button");
	expect(hasContainer(button)).toBe(true);
});

test("hasContainer: a filled button is a container", () => {
	const button = styled("b", "background-color: rgb(0, 0, 0)", "button");
	expect(hasContainer(button)).toBe(true);
});

test("hasContainer: a transparent icon button is not", () => {
	const button = styled(
		"b",
		"background-color: transparent; border: 0 solid rgb(0, 0, 0)",
		"button"
	);
	expect(hasContainer(button)).toBe(false);
	expect(hasContainer(element("glyph"))).toBe(false);
});

/** A bare wrapper `id` around `children`, on the page. */
function wrapper(id: string, ...children: (Node | string)[]): HTMLElement {
	const node = element(id);
	node.append(...children);
	return node;
}

test("paintedBox: an element that paints is its own box", () => {
	const card = styled("card", CARD);
	card.append(styled("inner", FILLED));
	expect(paintedBox(card)).toBe(card);
});

test("paintedBox: a bare wrapper closes into the one element inside that paints, at any depth", () => {
	const card = styled("card", CARD, "button");
	const middle = document.createElement("span");
	middle.append(card);
	const outer = wrapper("outer", " ", middle, "\n");
	expect(paintedBox(outer)).toBe(card);
});

test("paintedBox: a painted element that is only part of the content is not the box", () => {
	const pill = styled("pill", FILLED, "b");
	const withText = wrapper("with-text", "Score ", pill);
	expect(paintedBox(withText)).toBe(withText);
	const twins = wrapper(
		"twins",
		styled("a", FILLED, "b"),
		styled("b", FILLED, "b")
	);
	expect(paintedBox(twins)).toBe(twins);
});

test("paintedBox: a chain that paints nowhere is the element itself", () => {
	const inner = document.createElement("span");
	const outer = wrapper("outer", inner);
	expect(paintedBox(outer)).toBe(outer);
});

test("hasContainer: a bare wrapper around one painting element is a container", () => {
	expect(
		hasContainer(wrapper("outer", styled("pill", FILLED, "button")))
	).toBe(true);
});

/** A `Morph` as it renders by default: a bare `<div>` carrying the record's
 *  id, around the card that paints. */
function morphWrapper(): { root: HTMLElement; card: HTMLElement } {
	const card = styled("card-button", FILLED, "button");
	const root = wrapper("morph", card);
	root.setAttribute(MORPH_OF, "a");
	return { root, card };
}

test("a close into a bare Morph wrapper shrinks into the card inside: its box, its surface, its fade", async () => {
	const { root, card } = morphWrapper();
	placeAt(root, 0, 0, 600, 100);
	placeAt(card, 20, 10, 200, 40);
	const seen: Record<string, unknown>[] = [];
	fakeViewTransitions({
		onSnapshot: () => {
			seen.push({
				names: heldNames(),
				to: rootVariable(SURFACE_TO_VARS.background),
				ghostWidth: document
					.querySelector<HTMLElement>(`[${MORPH_GHOST}]`)
					?.style.getPropertyValue(GHOST_GEOMETRY_VARS.width),
			});
		},
	});
	await morph({
		from: styled("sheet", CARD),
		to: () => root,
		direction: "close",
		update: () => {},
	});
	expect(seen).toEqual([
		{
			names: { "jf-morph": "ghost", "jf-morph-source": "card-button" },
			to: "rgb(10, 20, 30)",
			ghostWidth: "200px",
		},
	]);
});

test("an open from a bare Morph wrapper grows from the card inside", async () => {
	const seen = recordSurface();
	const { root } = morphWrapper();
	await morph({
		from: root,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(seen.old[0].names).toEqual({
		"jf-morph": "ghost",
		"jf-morph-source": "card-button",
	});
	expect(seen.new[0].from).toBe("rgb(10, 20, 30)");
});

test("a container source: the surface grows from its box into the target", async () => {
	const seen = recordSurface();
	const source = styled("source", FILLED, "button");
	const card = styled("card", CARD);
	await morph({ from: source, to: () => card, update: () => {} });
	expect(seen.old[0].names).toEqual({
		"jf-morph": "ghost",
		"jf-morph-source": "source",
	});
	expect(seen.old[0].ghosts).toBe(1);
	expect(seen.new[0].names).toEqual({ "jf-morph": "card" });
	expect(seen.new[0].ghosts).toBe(0);
	expect(seen.new[0].from).toBe("rgb(10, 20, 30)");
	expect(seen.new[0].to).toBe("rgb(250, 250, 250)");
	expect(seen.new[0].kinds.split(" ")).toContain("morph-grow");
	expect(rootVariable(SURFACE_FROM_VARS.background)).toBe("");
	expect(document.querySelector(`[${MORPH_GHOST}]`)).toBeNull();
});

test("an icon source stays live: not named; the card grows out of its box", async () => {
	const seen = recordSurface();
	const icon = styled("icon", "background-color: transparent", "button");
	const card = styled("card", CARD);
	await morph({ from: icon, to: () => card, update: () => {} });
	expect(seen.old[0].names).toEqual({ "jf-morph": "ghost" });
	expect(seen.new[0].names).toEqual({ "jf-morph": "card" });
	// The card's own surface, from the icon's box.
	expect(seen.new[0].from).toBe("rgb(250, 250, 250)");
	expect(seen.new[0].to).toBe("rgb(250, 250, 250)");
});

test("a close into a container: the card shrinks into the target's box and surface", async () => {
	const seen = recordSurface();
	const card = styled("card", CARD);
	const row = element("row");
	row.setAttribute("role", "row");
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	await morph({
		from: card,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names).toEqual({ "jf-morph": "card" });
	expect(seen.new[0].names).toEqual({
		"jf-morph": "ghost",
		"jf-morph-source": "row",
	});
	expect(seen.new[0].ghosts).toBe(1);
	expect(seen.new[0].from).toBe("rgb(250, 250, 250)");
	expect(seen.new[0].to).toBe("rgb(5, 5, 5)");
	expect(seen.new[0].kinds.split(" ")).toContain("morph-shrink");
	expect(document.querySelector(`[${MORPH_GHOST}]`)).toBeNull();
});

test("a close into an icon: the card shrinks to its box and fades; the icon is not named", async () => {
	const seen = recordSurface();
	const card = styled("card", CARD);
	const icon = styled("icon", "background-color: transparent", "button");
	await morph({
		from: card,
		to: () => icon,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].names).toEqual({ "jf-morph": "ghost" });
	expect(seen.new[0].to).toBe("rgba(0, 0, 0, 0)");
});

/** An overlay as it renders: a portal holding its scrim beside the
 *  positioner around its card. `isMarked`: the scrim fades with the morph.
 *  `prefix` tells two overlays' ids apart. */
function overlay(
	isMarked = true,
	prefix = "",
	style = CARD
): { card: HTMLElement; scrim: HTMLElement } {
	const portal = element(`${prefix}portal`);
	const scrim = document.createElement("div");
	scrim.id = `${prefix}scrim`;
	if (isMarked) scrim.setAttribute(MORPH_SCRIM, "");
	const positioner = document.createElement("div");
	const card = styled(`${prefix}card`, style);
	positioner.append(card);
	portal.append(scrim, positioner);
	return { card, scrim };
}

test("an open fades the overlay's marked scrim in with the morph", async () => {
	const seen = recordSurface();
	const source = styled("source", FILLED, "button");
	const { card } = overlay();
	await morph({ from: source, to: () => card, update: () => {} });
	expect(seen.old[0].names["jf-morph-scrim"]).toBeUndefined();
	expect(seen.new[0].names["jf-morph-scrim"]).toBe("scrim");
});

test("a close fades the closing overlay's marked scrim out with the morph", async () => {
	const seen = recordSurface();
	const { card } = overlay();
	const row = element("row");
	row.setAttribute("role", "row");
	await morph({
		from: card,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names["jf-morph-scrim"]).toBe("scrim");
	expect(seen.new[0].names["jf-morph-scrim"]).toBeUndefined();
});

test("an open with no source still fades the marked scrim in: the overlay's own fade is off under a morph", async () => {
	const seen = recordSurface();
	const { card } = overlay();
	await morph({ from: null, to: () => card, update: () => {} });
	expect(seen.new[0].names["jf-morph-scrim"]).toBe("scrim");
});

test("a close into no target still fades the marked scrim out", async () => {
	const seen = recordSurface();
	const { card } = overlay();
	await morph({
		from: card,
		to: () => null,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names["jf-morph-scrim"]).toBe("scrim");
});

test("an unmarked scrim keeps its own fade", async () => {
	const seen = recordSurface();
	const plain = overlay(false);
	await morph({
		from: styled("source", FILLED, "button"),
		to: () => plain.card,
		update: () => {},
	});
	expect(seen.new[0].names["jf-morph-scrim"]).toBeUndefined();
});

test("a scale-look open and close fade the marked scrim too: the overlay's own fade is off under a morph", async () => {
	const seen = recordSurface();
	const field = textField("field");
	const { card } = overlay();
	await morph({ from: field, to: () => card, update: () => {} });
	await morph({
		from: card,
		to: () => field,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].names["jf-morph-scrim"]).toBe("scrim");
	expect(seen.old[1].names["jf-morph-scrim"]).toBe("scrim");
});

/** Closes `from` while `claimant` opens in the same transition, claiming
 *  its handoff. */
function handOff(from: HTMLElement, claimant: HTMLElement) {
	return morph({
		from,
		to: () => asRow(element("row")),
		direction: "close",
		update: () => {
			expect(claimHandoff(() => claimant)).not.toBeNull();
			void joinHandoff(() => {});
		},
	});
}

test("a handoff draws the surface from the closer's box to the claimant's, one scrim throughout", async () => {
	const seen = recordSurface();
	const sheet = overlay(true, "sheet-");
	const dialog = overlay(true, "dialog-", FILLED);
	await handOff(sheet.card, dialog.card);
	expect(seen.old[0].names).toEqual({
		"jf-morph": "sheet-card",
		"jf-morph-scrim": "sheet-scrim",
	});
	expect(seen.new[0].names).toEqual({
		"jf-morph": "dialog-card",
		"jf-morph-scrim": "dialog-scrim",
	});
	// Nothing reaches <html> before the old snapshot.
	expect(seen.old[0].from).toBe("");
	expect(seen.new[0].from).toBe("rgb(250, 250, 250)");
	expect(seen.new[0].to).toBe("rgb(10, 20, 30)");
	expect(seen.new[0].ghosts).toBe(0);
	const kinds = kindsOf(seen.new[0].kinds);
	expect(kinds).toContain("morph-handoff");
	expect(kinds).toContain("morph-box");
	expect(kinds).not.toContain("morph-grow");
	expect(kinds).not.toContain("morph-shrink");
	expect(rootVariable(SURFACE_FROM_VARS.background)).toBe("");
});

test("a picked row hands off: the surface grows from the row's box into the claimant", async () => {
	const seen = recordSurface();
	const palette = overlay(true, "palette-");
	const row = styled("picked", FILLED, "li");
	palette.card.append(row);
	const sheet = overlay(true, "sheet-");
	await handOff(row, sheet.card);
	expect(seen.old[0].names).toEqual({
		"jf-morph": "picked",
		"jf-morph-scrim": "palette-scrim",
	});
	expect(seen.new[0].names).toEqual({
		"jf-morph": "sheet-card",
		"jf-morph-scrim": "sheet-scrim",
	});
	expect(seen.new[0].from).toBe("rgb(10, 20, 30)");
	expect(seen.new[0].to).toBe("rgb(250, 250, 250)");
	expect(kindsOf(seen.new[0].kinds)).toContain("morph-handoff");
});

test("a handoff whose closer joined a running transition draws no surface and names no scrim", async () => {
	const seen = recordSurface();
	const sheet = overlay(true, "sheet-");
	const dialog = overlay(true, "dialog-", FILLED);
	await viewTransition(() => {
		void handOff(sheet.card, dialog.card);
	});
	expect(seen.new[0].names).toEqual({ "jf-morph": "dialog-card" });
	expect(seen.new[0].from).toBe("");
	expect(kindsOf(seen.new[0].kinds)).not.toContain("morph-handoff");
});

test("a close with no target scales to the centre: no ghost, no surface", async () => {
	const seen = recordSurface();
	const card = styled("card", CARD);
	await morph({
		from: card,
		to: () => null,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].names).toEqual({});
	expect(seen.new[0].ghosts).toBe(0);
	expect(seen.new[0].kinds).toBe("morph morph-box");
});

/** A table row whose cells carry their column's id as their key. */
function rowWithCells(keys: string[]): HTMLElement {
	const row = element("row");
	row.setAttribute("role", "row");
	keys.forEach((key, index) => {
		const cell = document.createElement("span");
		cell.id = `cell-${index}`;
		cell.setAttribute(MORPH_KEY, key);
		row.append(cell);
	});
	return row;
}

/** A sheet whose property values carry their field's key. */
function sheetWithFields(keys: string[]): HTMLElement {
	const sheet = styled("sheet", CARD);
	keys.forEach((key, index) => {
		const value = document.createElement("span");
		value.id = `field-${index}`;
		value.setAttribute(MORPH_KEY, key);
		sheet.append(value);
	});
	return sheet;
}

/** A span with `id` carrying `attribute` (value `value`). */
function marked(id: string, attribute: string, value = ""): HTMLElement {
	const node = document.createElement("span");
	node.id = id;
	node.setAttribute(attribute, value);
	return node;
}

test("a cell flies into the sheet value with the same key", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status", "dueDate"]);
	const sheet = sheetWithFields(["dueDate", "status"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-status": "cell-0",
		"jf-morph-part-dueDate": "cell-1",
	});
	expect(seen.new[0].names).toMatchObject({
		"jf-morph-part-status": "field-1",
		"jf-morph-part-dueDate": "field-0",
	});
});

test("a close flies only the sheet values its row shows: the rest shrink with the card", async () => {
	const seen = recordSurface();
	const sheet = sheetWithFields(["status", "notes"]);
	const row = rowWithCells(["status"]);
	await morph({
		from: sheet,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names).toHaveProperty("jf-morph-part-status");
	expect(seen.old[0].names).not.toHaveProperty("jf-morph-part-notes");
});

/** Lays `element` out at the given box (happy-dom lays nothing out). */
function placeAt(
	element: HTMLElement,
	x: number,
	y: number,
	width: number,
	height: number
): void {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
		new DOMRect(x, y, width, height)
	);
}

test("a row partly off screen opens from its visible part: clipped source, ghost over what shows, only whole cells fly", async () => {
	vi.stubGlobal("innerWidth", 1000);
	vi.stubGlobal("innerHeight", 800);
	const row = rowWithCells(["status", "dueDate"]);
	const [shown, cut] = row.children as unknown as HTMLElement[];
	placeAt(row, -200, 300, 1100, 40);
	placeAt(shown, 100, 310, 80, 20);
	placeAt(cut, -150, 310, 80, 20);
	const sheet = sheetWithFields(["status", "dueDate"]);
	const old = { clip: "", left: "", width: "", names: {} };
	fakeViewTransitions({
		onStart: () => {
			const ghost = document.querySelector<HTMLElement>(
				`[${MORPH_GHOST}]`
			);
			Object.assign(old, {
				clip: rootVariable(SOURCE_CLIP_VAR),
				left: ghost?.style.getPropertyValue(GHOST_GEOMETRY_VARS.left),
				width: ghost?.style.getPropertyValue(GHOST_GEOMETRY_VARS.width),
				names: heldNames(),
			});
		},
	});
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(old.clip).toBe("inset(0px 0px 0px 200px)");
	expect([old.left, old.width]).toEqual(["0px", "900px"]);
	expect(old.names).toHaveProperty("jf-morph-part-status", "cell-0");
	expect(old.names).not.toHaveProperty("jf-morph-part-dueDate");
	expect(rootVariable(SOURCE_CLIP_VAR)).toBe("");
});

test("keys pair exactly: another case or spelling does not fly", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status", "owner"]);
	const sheet = sheetWithFields(["status", "Owner"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names).toEqual({
		"jf-morph": "sheet",
		"jf-morph-part-status": "field-0",
	});
});

test("a value without a key never flies", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status"]);
	const sheet = sheetWithFields([]);
	const plain = document.createElement("span");
	plain.id = "plain";
	sheet.append(plain);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(Object.values(seen.new[0].names)).not.toContain("plain");
	expect(seen.new[0].names["jf-morph-part-status"]).toBeUndefined();
});

test("the same key twice in one end: the first wins, with a dev warning", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const seen = recordSurface();
	const row = rowWithCells(["status"]);
	const sheet = sheetWithFields(["status", "status"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names["jf-morph-part-status"]).toBe("field-0");
	expect(warn).toHaveBeenCalledWith(expect.stringContaining('"status"'));
});

test("every fully visible keyed value flies, named by its key, with the part class", async () => {
	const seen = recordSurface();
	const keys = Array.from({ length: 12 }, (_, index) => `col${index}`);
	const row = rowWithCells(keys);
	const sheet = sheetWithFields(keys);
	await morph({ from: row, to: () => sheet, update: () => {} });
	const cells = keys.map((_, index) => `cell-${index}`);
	const fields = keys.map((_, index) => `field-${index}`);
	keys.forEach((key, index) => {
		expect(seen.old[0].names[`jf-morph-part-${key}`]).toBe(cells[index]);
		expect(seen.new[0].names[`jf-morph-part-${key}`]).toBe(fields[index]);
	});
	expect(seen.old[0].classes).toEqual(
		Object.fromEntries(cells.map((id) => [id, PART_CLASS]))
	);
	expect(seen.new[0].classes).toEqual(
		Object.fromEntries(fields.map((id) => [id, PART_CLASS]))
	);
	expect(heldClasses()).toEqual({});
	expect(heldNames()).toEqual({});
});

test("a key that is not a CSS ident flies under its escaped name", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["a.b", "a b"]);
	const sheet = sheetWithFields(["a b", "a.b"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names).toMatchObject({
		[String.raw`jf-morph-part-a\.b`]: "field-1",
		[String.raw`jf-morph-part-a\ b`]: "field-0",
	});
});

test("nothing inside a placeholder pairs or is named: the surface still morphs", async () => {
	const seen = recordSurface();
	const row = asRow(withTitle("row", "cell-title"));
	row.append(marked("cell-0", MORPH_KEY, "status"));
	const sheet = styled("sheet", CARD);
	const skeleton = document.createElement("div");
	skeleton.setAttribute(SHEET_SKELETON, "");
	skeleton.append(
		marked("field-0", MORPH_KEY, "status"),
		marked("sheet-title", MORPH_TITLE)
	);
	sheet.append(skeleton);
	await morph({ from: row, to: () => sheet, update: () => {} });
	const named = Object.values(seen.new[0].names);
	expect(named).not.toContain("field-0");
	expect(named).not.toContain("sheet-title");
	expect(seen.new[0].kinds.split(" ")).toContain("morph-grow");
});

test("with real content in place of the placeholder, the values pair", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status"]);
	const sheet = sheetWithFields(["status"]);
	const skeleton = document.createElement("div");
	skeleton.setAttribute(SHEET_SKELETON, "");
	skeleton.append(marked("placeholder-0", MORPH_KEY, "status"));
	sheet.prepend(skeleton);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names["jf-morph-part-status"]).toBe("field-0");
});

test("a value inside a hidden (closed) section does not pair; a hidden end still does", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status", "dueDate"]);
	const sheet = sheetWithFields(["status"]);
	sheet.setAttribute("hidden", "");
	const section = document.createElement("div");
	section.setAttribute("hidden", "");
	section.append(marked("closed", MORPH_KEY, "dueDate"));
	sheet.append(section);
	await morph({ from: row, to: () => sheet, update: () => {} });
	const named = Object.values(seen.new[0].names);
	expect(named).toContain("field-0");
	expect(named).not.toContain("closed");
});

test("a value of another entity nested in the end does not take part", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["dueDate"]);
	const sheet = sheetWithFields([]);
	const card = document.createElement("article");
	card.setAttribute(MORPH_OF, "task-1");
	card.append(marked("nested", MORPH_KEY, "dueDate"));
	sheet.append(card);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(Object.values(seen.new[0].names)).not.toContain("nested");
});

test("a keyed title flies into the target's value with its key, ahead of the target's title", async () => {
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.append(marked("cell-title", MORPH_TITLE, "firstName"));
	const sheet = withTitle("sheet", "sheet-title");
	sheet.append(marked("first-half", MORPH_KEY, "firstName"));
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names["jf-morph-title"]).toBe("first-half");
});

test("a title split into keyed halves closes each half into its cell, the first into the keyed title cell", async () => {
	const seen = recordSurface();
	const sheet = styled("sheet", CARD);
	const title = marked("sheet-title", MORPH_TITLE);
	title.append(
		marked("first-half", MORPH_KEY, "firstName"),
		marked("last-half", MORPH_KEY, "lastName")
	);
	sheet.append(title);
	const row = asRow(element("row"));
	row.append(
		marked("cell-title", MORPH_TITLE, "firstName"),
		marked("cell-last", MORPH_KEY, "lastName")
	);
	await morph({
		from: sheet,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-firstName": "first-half",
		"jf-morph-part-lastName": "last-half",
	});
	expect(Object.values(seen.old[0].names)).not.toContain("sheet-title");
	expect(seen.new[0].names).toMatchObject({
		"jf-morph-part-firstName": "cell-title",
		"jf-morph-part-lastName": "cell-last",
	});
});

test("a keyed title without that key in the target flies into its title", async () => {
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.append(marked("cell-title", MORPH_TITLE, "name"));
	const sheet = withTitle("sheet", "sheet-title");
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names["jf-morph-title"]).toBe("sheet-title");
});

test("a close resolves its target once, before it starts, and pairs every value against that target", async () => {
	const seen = { old: [] as string[][], new: [] as string[][] };
	const sheet = withTitle("sheet", "title");
	sheet.append(
		marked("sheet-status", MORPH_KEY, "status"),
		marked("sheet-notes", MORPH_KEY, "notes")
	);
	const row = withTitle("row", "cell");
	row.setAttribute("role", "row");
	row.append(marked("row-status", MORPH_KEY, "status"));
	// A second read would find a row that shows the notes too.
	const rerendered = withTitle("rerendered", "rerendered-cell");
	rerendered.append(marked("rerendered-notes", MORPH_KEY, "notes"));
	const to = vi.fn().mockReturnValueOnce(row).mockReturnValue(rerendered);
	let readsAtStart = 0;
	fakeViewTransitions({
		onStart: () => {
			readsAtStart = to.mock.calls.length;
			seen.old.push(namedIds());
		},
		onSnapshot: () => seen.new.push(namedIds()),
	});
	await morph({ from: sheet, to, direction: "close", update: () => {} });
	expect(readsAtStart).toBe(1);
	expect(to).toHaveBeenCalledTimes(1);
	expect(seen.old).toEqual([["sheet", "title", "sheet-status"]]);
	expect(seen.new[0]).toEqual(
		expect.arrayContaining(["row", "cell", "row-status"])
	);
	expect(seen.new[0]).not.toContain("rerendered-notes");
});

test("a morph joining a transition already past its old snapshot draws no surface", async () => {
	const seen = recordSurface();
	const source = styled("source", FILLED, "button");
	const card = styled("card", CARD);
	await viewTransition(() => {
		void morph({ from: source, to: () => card, update: () => {} });
	});
	expect(seen.new[0].ghosts).toBe(0);
	expect(seen.new[0].kinds.split(" ")).not.toContain("morph-grow");
	expect(seen.new[0].from).toBe("");
});

// --- The look, picked from the trigger's end --------------------------------

/** A filled, bordered field root around its input (the DS Field). */
function textField(id: string): HTMLElement {
	const root = styled(id, CARD);
	root.append(document.createElement("input"));
	return root;
}

function kindsOf(kinds: string): string[] {
	return kinds.split(" ");
}

test("a text field source takes the scale look: no ghost, no surface, no pin", async () => {
	const seen = recordSurface();
	const field = textField("field");
	const palette = styled("palette", CARD);
	await morph({ from: field, to: () => palette, update: () => {} });
	expect(seen.old[0].names).toEqual({ "jf-morph": "field" });
	expect(seen.old[0].ghosts).toBe(0);
	expect(seen.old[0].pins).toBe(0);
	expect(seen.new[0].kinds).toBe("morph morph-scale");
});

/** The DS Field as it paints: a bare root around the input's filled wrapper. */
function dsField(id: string): HTMLElement {
	const root = element(id);
	const wrapper = document.createElement("div");
	wrapper.setAttribute("style", FILLED);
	wrapper.append(document.createElement("input"));
	root.append(wrapper);
	return root;
}

test("a field root painted on its input's wrapper is a container, and scales", async () => {
	const root = dsField("field");
	expect(hasContainer(root)).toBe(true);
	const seen = recordSurface();
	await morph({ from: root, to: () => styled("p", CARD), update: () => {} });
	expect(seen.old[0].names).toEqual({ "jf-morph": "field" });
	expect(seen.new[0].kinds).toBe("morph morph-scale");
});

test("a bare wrapper around a bare input is no container: it grows", async () => {
	const root = element("field");
	root.append(document.createElement("input"));
	expect(hasContainer(root)).toBe(false);
	const seen = recordSurface();
	await morph({ from: root, to: () => styled("p", CARD), update: () => {} });
	expect(kindsOf(seen.new[0].kinds)).toContain("morph-grow");
});

test("a bordered input is a text field too", async () => {
	const seen = recordSurface();
	const input = styled("input", "border: 1px solid rgb(0, 0, 0)", "input");
	await morph({ from: input, to: () => styled("p", CARD), update: () => {} });
	expect(seen.new[0].kinds).toBe("morph morph-scale");
});

test("an icon source takes the grow path, not the scale look", async () => {
	const seen = recordSurface();
	const icon = styled("icon", "background-color: transparent", "button");
	await morph({ from: icon, to: () => styled("p", CARD), update: () => {} });
	expect(kindsOf(seen.new[0].kinds)).not.toContain("morph-scale");
	expect(kindsOf(seen.new[0].kinds)).toContain("morph-grow");
	expect(seen.old[0].names).toEqual({ "jf-morph": "ghost" });
});

test("a bordered button and a row (even one holding an input) take the surface morph", async () => {
	const seen = recordSurface();
	const button = styled("b", "border: 1px solid rgb(0, 0, 0)", "button");
	await morph({
		from: button,
		to: () => styled("p", CARD),
		update: () => {},
	});
	const row = asRow(element("row"));
	row.append(document.createElement("input"));
	await morph({ from: row, to: () => styled("q", CARD), update: () => {} });
	expect(seen.new).toHaveLength(2);
	for (const snapshot of seen.new) {
		expect(kindsOf(snapshot.kinds)).toContain("morph-grow");
		expect(kindsOf(snapshot.kinds)).not.toContain("morph-scale");
	}
});

test("a close takes its look from what it closes into", async () => {
	const seen = recordSurface();
	const field = textField("field");
	await morph({
		from: styled("palette", CARD),
		to: () => field,
		direction: "close",
		update: () => {},
	});
	const icon = styled("icon", "background-color: transparent", "button");
	await morph({
		from: styled("palette-2", CARD),
		to: () => icon,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].kinds).toBe("morph morph-scale");
	expect(seen.new[0].ghosts).toBe(0);
	expect(seen.new[0].names).toEqual({ "jf-morph": "field" });
	expect(kindsOf(seen.new[1].kinds)).toContain("morph-shrink");
	expect(kindsOf(seen.new[1].kinds)).not.toContain("morph-scale");
});

// --- The compiled stylesheet ---------------------------------------------------

/** viewTransition.scss as the browser gets it, comments dropped. */
const COMPILED = compile(
	`${import.meta.dirname}/../styles/viewTransition.scss`,
	{
		style: "expanded",
	}
).css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

type CompiledRule = { selectors: string[]; body: string; text: string };

/** Every innermost rule of `css`, in order (an `@media` or `@keyframes`
 *  wrapper drops away, its rules stay). */
function innermostRules(css: string): CompiledRule[] {
	return css.split("}").flatMap((chunk) => {
		const open = chunk.lastIndexOf("{");
		if (open === -1) return [];
		const head = chunk.slice(0, open);
		const selectors = head.slice(head.lastIndexOf("{") + 1).trim();
		const body = chunk.slice(open + 1);
		return [
			{
				selectors: selectors
					.split(",")
					.map((selector) => selector.trim()),
				body,
				text: `${selectors} {${body}}`,
			},
		];
	});
}

const RULES = innermostRules(COMPILED);

/** The index of the first compiled rule listing `selector`. */
function ruleIndex(selector: string): number {
	return RULES.findIndex((rule) => rule.selectors.includes(selector));
}

/** The compiled rule listing `selector`; fails the test when there is none. */
function compiledRule(selector: string): CompiledRule {
	const rule = RULES[ruleIndex(selector)];
	expect(rule, `a compiled rule for ${selector}`).toBeDefined();
	return rule;
}

function zIndexOf(selector: string): number {
	return Number(/z-index: ([^;]+);/.exec(compiledRule(selector).body)?.[1]);
}

// --- The hover pin ------------------------------------------------------------

const HOVER = "rgb(43, 43, 43)";

/** Puts `css` on the page for this test. */
function installCss(css: string): void {
	const style = document.createElement("style");
	style.textContent = css;
	document.head.append(style);
	onTestFinished(() => {
		style.remove();
	});
}

/** A component's hover rule, as the hover mixin writes it: hovered or
 *  pinned, the same look. */
function installHoverRule(selector: string): void {
	installCss(
		`${selector}:hover, ${selector}${MORPH_PINNED_SELECTOR} { background-color: ${HOVER}; }`
	);
}

/** Holds `nodes` under the pointer: happy-dom matches no `:hover`. */
function hold(...nodes: Element[]): void {
	const doesMatch = Reflect.get(Element.prototype, "matches") as (
		this: Element,
		selector: string
	) => boolean;
	vi.spyOn(Element.prototype, "matches").mockImplementation(function (
		this: Element,
		selector: string
	) {
		const isHover =
			typeof selector === "string" && selector.includes(":hover");
		return (
			(isHover && nodes.includes(this)) || doesMatch.call(this, selector)
		);
	});
	onTestFinished(() => {
		vi.restoreAllMocks();
	});
}

test("an open pins its source's held elements with one attribute, then lets go", async () => {
	installHoverRule("#row");
	const row = asRow(element("row"));
	const plainCell = document.createElement("span");
	const heldCell = document.createElement("button");
	const inner = document.createElement("span");
	heldCell.append(inner);
	row.append(plainCell, heldCell);
	hold(row, heldCell);
	const pinned: Record<string, unknown>[] = [];
	fakeViewTransitions({
		onStart: () => {
			pinned.push({
				row: row.getAttribute(MORPH_PINNED),
				matches: row.matches(MORPH_PINNED_SELECTOR),
				// Chrome drops :hover as the transition starts: the hover
				// rule still holds the look through the pin.
				painted: getComputedStyle(row).backgroundColor,
				vars: inlineProperties(row).filter((name) =>
					name.startsWith("--")
				),
				plainCell: plainCell.hasAttribute(MORPH_PINNED),
				heldCell: heldCell.matches(MORPH_PINNED_SELECTOR),
				inner: inner.hasAttribute(MORPH_PINNED),
			});
		},
	});
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(pinned).toEqual([
		{
			row: "held",
			matches: true,
			painted: HOVER,
			vars: [],
			plainCell: false,
			heldCell: true,
			inner: false,
		},
	]);
	for (const node of [row, heldCell]) {
		expect(node).not.toHaveAttribute(MORPH_PINNED);
	}
});

test("an open from a source at rest pins nothing: nothing changes its look", async () => {
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(seen.old[0].pins).toBe(0);
});

test("the surface starts from the hovered colour", async () => {
	installHoverRule("#row");
	const seen = recordSurface();
	const row = asRow(element("row"));
	hold(row);
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(seen.new[0].from).toBe(HOVER);
});

test("a pinned hover background does not make an icon button a container", () => {
	installHoverRule("#icon");
	const icon = styled("icon", "", "button");
	icon.setAttribute(MORPH_PINNED, "held");
	expect(getComputedStyle(icon).backgroundColor).toBe(HOVER);
	expect(hasContainer(icon)).toBe(false);
});

test("a close pins nothing", async () => {
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	const sheet = styled("sheet", CARD);
	hold(sheet);
	await morph({
		from: sheet,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].pins).toBe(0);
});

// --- The ends keep their surface -------------------------------------------------

/** A bordered row with a plain cell and a cell that paints its own fill. */
function rowWithFilledCell(): HTMLElement {
	const row = asRow(element("row"));
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	row.style.setProperty("border", "1px solid rgb(1, 2, 3)");
	const plainCell = document.createElement("span");
	plainCell.id = "plain";
	const stickyCell = document.createElement("span");
	stickyCell.id = "sticky";
	stickyCell.style.setProperty("background-color", "rgb(5, 5, 5)");
	stickyCell.style.setProperty("border-color", "rgb(5, 5, 5)");
	row.append(plainCell, stickyCell);
	return row;
}

/** Every page-level morph rule of viewTransition.scss (pin, ghost, hidden),
 *  for this test: what the frozen old frame paints comes from them. */
function installPageRules(): void {
	const style = document.createElement("style");
	style.textContent = RULES.filter((rule) =>
		rule.selectors.every((selector) => selector.startsWith("[data-morph"))
	)
		.map((rule) => rule.text)
		.join("\n");
	document.head.append(style);
	onTestFinished(() => {
		style.remove();
	});
}

function byName(left: string, right: string): number {
	return left.localeCompare(right);
}

type Look = { fill: string; border: string; morph: string[] };

/** What `node` paints, and the morph attributes it carries. */
function paintedLook(node: HTMLElement): Look {
	const style = getComputedStyle(node);
	return {
		fill: style.backgroundColor,
		border: `${style.borderTopWidth} ${style.borderTopColor}`,
		morph: node
			.getAttributeNames()
			.filter((name) => name.startsWith("data-morph-")),
	};
}

function looksOf(nodes: HTMLElement[]): Record<string, Look> {
	return Object.fromEntries(
		nodes.map((node) => [node.id, paintedLook(node)])
	);
}

/** The row's and its filled cell's look before the morph, and at each
 *  snapshot. */
function recordLooks(row: HTMLElement) {
	const layers = [row, row.children[1] as HTMLElement];
	const before = looksOf(layers);
	const seen = {
		old: [] as Record<string, Look>[],
		new: [] as Record<string, Look>[],
	};
	fakeViewTransitions({
		onStart: () => seen.old.push(looksOf(layers)),
		onSnapshot: () => seen.new.push(looksOf(layers)),
	});
	return { before, seen };
}

test("an open leaves its source's fill and border as they were: the frozen old frame is the page before the click", async () => {
	installPageRules();
	const row = rowWithFilledCell();
	hold(row);
	const { before, seen } = recordLooks(row);
	expect(before.row.fill).toBe("rgb(5, 5, 5)");
	expect(before.row.border).toBe("1px rgb(1, 2, 3)");
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	// Only the pin is added, on the held row, and no page rule paints it.
	const pinned = {
		...before,
		row: { ...before.row, morph: [MORPH_PINNED] },
	};
	expect(seen.old).toEqual([pinned]);
	expect(seen.new).toEqual([pinned]);
	expect(looksOf([row])).toEqual({ row: before.row });
});

test("a close into a container leaves its fill and border as they were", async () => {
	installPageRules();
	const row = rowWithFilledCell();
	const { before, seen } = recordLooks(row);
	await morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.new).toEqual([before]);
});

test.each(["open", "close"] as const)(
	"the ghost (%s) carries only geometry: it paints nothing",
	async (direction) => {
		installPageRules();
		const row = rowWithFilledCell();
		const card = styled("card", CARD);
		const ghosts: Record<string, unknown>[] = [];
		function probe(): void {
			const ghost = document.querySelector<HTMLElement>(
				`[${MORPH_GHOST}]`
			);
			if (!ghost) return;
			const style = getComputedStyle(ghost);
			ghosts.push({
				vars: Array.from({ length: ghost.style.length }, (_, index) =>
					ghost.style.item(index)
				)
					.filter((name) => name.startsWith("--"))
					.sort(byName),
				fill: style.backgroundColor,
				shadow: style.boxShadow,
				radius: style.borderTopLeftRadius,
			});
		}
		fakeViewTransitions({ onStart: probe, onSnapshot: probe });
		await morph(
			direction === "open"
				? { from: row, to: () => card, update: () => {} }
				: { from: card, to: () => row, direction, update: () => {} }
		);
		expect(ghosts).toHaveLength(1);
		expect(ghosts[0].vars).toEqual(
			Object.values(GHOST_GEOMETRY_VARS).sort(byName)
		);
		expect(ghosts[0].fill).toMatch(/^(?:transparent|rgba\(0, 0, 0, 0\))?$/);
		expect(ghosts[0].shadow).toMatch(/^(?:none)?$/);
		expect(ghosts[0].radius).toMatch(/^(?:0px)?$/);
	}
);

test("nothing but the pin comes and goes on an open's held source", async () => {
	fakeViewTransitions();
	const row = rowWithFilledCell();
	hold(row);
	const changes: string[] = [];
	const set = row.setAttribute.bind(row);
	const remove = row.removeAttribute.bind(row);
	vi.spyOn(row, "setAttribute").mockImplementation((name, value) => {
		if (name.startsWith("data-morph-")) changes.push(`+${name}`);
		set(name, value);
	});
	vi.spyOn(row, "removeAttribute").mockImplementation((name) => {
		if (name.startsWith("data-morph-")) changes.push(`-${name}`);
		remove(name);
	});
	onTestFinished(() => {
		vi.restoreAllMocks();
	});
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(changes).toEqual([`+${MORPH_PINNED}`, `-${MORPH_PINNED}`]);
});

test("a skipped transition lets the pin and the ghost go", async () => {
	const start = vi.fn((update: () => Promise<void> | void) => {
		const updated = Promise.resolve().then(update);
		const skipped = updated.then(() => {
			throw new Error("skipped");
		});
		void skipped.catch(() => {});
		return {
			finished: skipped,
			updateCallbackDone: updated,
			ready: skipped,
		};
	});
	installViewTransitions(start);
	const row = rowWithFilledCell();
	hold(row);
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(start).toHaveBeenCalled();
	expect(document.querySelector(`[${MORPH_PINNED}]`)).toBeNull();
	expect(document.querySelector(`[${MORPH_GHOST}]`)).toBeNull();
});

// --- Overlapping morphs -----------------------------------------------------------

/**
 * Fake transitions that each finish only when the test says so: `snapshot(i)`
 * waits for the i-th one's update, `finish(i)` ends it.
 */
function heldTransitions() {
	const updates: Promise<unknown>[] = [];
	const finishes: (() => void)[] = [];
	installViewTransitions(
		vi.fn((update: () => Promise<void> | void) => {
			const updated = Promise.resolve().then(update);
			updates.push(updated);
			const finished = new Promise<void>((resolve) => {
				finishes.push(resolve);
			});
			return { finished, updateCallbackDone: updated };
		})
	);
	return {
		snapshot: (index: number) => updates[index],
		finish: (index: number) => {
			finishes[index]();
		},
	};
}

/** The shared state a morph out of `row` sets up. */
function morphStateOf(row: HTMLElement) {
	return {
		pinned: row.hasAttribute(MORPH_PINNED),
		from: rootVariable(SURFACE_FROM_VARS.background) !== "",
		to: rootVariable(SURFACE_TO_VARS.background) !== "",
		clip: rootVariable(SOURCE_CLIP_VAR) !== "",
	};
}

test("a morph that starts while the last one finishes keeps its state through that one's cleanup", async () => {
	const transitions = heldTransitions();
	const row = rowWithFilledCell();
	// A: the sheet closes into the row.
	const closing = morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	await transitions.snapshot(0);
	// B: the row is clicked again before A's animation ends.
	hold(row);
	const opening = morph({
		from: row,
		to: () => styled("next", CARD),
		update: () => {},
	});
	await transitions.snapshot(1);
	const all = {
		pinned: true,
		from: true,
		to: true,
		clip: true,
	};
	expect(morphStateOf(row)).toEqual(all);
	transitions.finish(0);
	await closing;
	expect(morphStateOf(row)).toEqual(all);
	transitions.finish(1);
	await opening;
	expect(morphStateOf(row)).toEqual({
		pinned: false,
		from: false,
		to: false,
		clip: false,
	});
});

test("a morph that starts on a row the last one closes into reads the row's own surface", async () => {
	installPageRules();
	const transitions = heldTransitions();
	const row = rowWithFilledCell();
	const closing = morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	await transitions.snapshot(0);
	// The close leaves the row's fill on it.
	expect(getComputedStyle(row).backgroundColor).toBe("rgb(5, 5, 5)");
	hold(row);
	const opening = morph({
		from: row,
		to: () => styled("next", CARD),
		update: () => {},
	});
	await transitions.snapshot(1);
	expect(rootVariable(SURFACE_FROM_VARS.background)).toBe("rgb(5, 5, 5)");
	expect(row).toHaveAttribute(MORPH_PINNED);
	transitions.finish(0);
	transitions.finish(1);
	await Promise.all([closing, opening]);
	expect(document.querySelector(`[${MORPH_PINNED}]`)).toBeNull();
});

test("a cleanup that throws still resolves the morph, the error surfaced", async () => {
	fakeViewTransitions();
	const surfaced = captureSurfaced();
	const row = rowWithFilledCell();
	hold(row);
	const broken = new Error("cleanup");
	const remove = row.removeAttribute.bind(row);
	vi.spyOn(row, "removeAttribute").mockImplementation((name) => {
		// The unpin: the cleanup's write to the source.
		if (name === MORPH_PINNED) throw broken;
		remove(name);
	});
	await expect(
		morph({ from: row, to: () => styled("sheet", CARD), update: () => {} })
	).resolves.toEqual({ handedOff: false });
	expect(surfaced).toEqual([broken]);
});

// --- The stylesheet -----------------------------------------------------------

test("the scrim paints under the source, the source under the surface, the flying text over it", () => {
	const scrim = zIndexOf("::view-transition-group(jf-morph-scrim)");
	const source = zIndexOf("::view-transition-group(jf-morph-source)");
	const surface = zIndexOf("::view-transition-group(jf-morph)");
	expect(scrim).toBeLessThan(source);
	expect(source).toBeLessThan(surface);
	// The title and each part, from the text-flight mixin.
	for (const flight of ["jf-morph-title", `*.${PART_CLASS}`]) {
		expect(zIndexOf(`::view-transition-group(${flight})`)).toBeGreaterThan(
			surface
		);
	}
});

test("the ghost is a box that paints nothing: no fill, border, ring or corner", () => {
	const { body } = compiledRule(`[${MORPH_GHOST}]`);
	expect(body).toContain("position: fixed");
	expect(body).not.toMatch(/background|border|box-shadow|outline/);
});

test("the stylesheet paints nothing on a pinned element: its own hover rule holds its look", () => {
	const pinRules = RULES.filter((rule) =>
		rule.selectors.some((selector) => selector.includes(MORPH_PINNED))
	);
	expect(pinRules).toEqual([]);
});

test("no morph attribute turns a component's own transitions off", () => {
	const pageRules = RULES.filter((rule) =>
		rule.selectors.some((selector) => selector.startsWith("[data-morph"))
	);
	expect(pageRules.length).toBeGreaterThan(0);
	for (const rule of pageRules) expect(rule.body).not.toContain("transition");
});

test("the ghost and the morph's groups have their rules", () => {
	for (const selector of [
		`[${MORPH_GHOST}]`,
		"::view-transition-group(jf-morph)",
		"::view-transition-group(jf-morph-source)",
		"::view-transition-old(jf-morph-source)",
		":root[data-vt~=morph-grow]::view-transition-image-pair(jf-morph)",
		":root[data-vt~=morph-shrink]::view-transition-image-pair(jf-morph)",
		":root[data-vt~=morph-handoff]::view-transition-image-pair(jf-morph)",
	]) {
		compiledRule(selector);
	}
});

test("a handoff fades the closer out fast and the claimant in at the end, as the surface carries the motion", () => {
	const pair =
		":root[data-vt~=morph-handoff]::view-transition-image-pair(jf-morph)";
	expect(
		RULES.filter((rule) => rule.selectors.includes(pair)).map(
			(rule) => rule.body
		)
	).toContainEqual(expect.stringContaining("jf-vt-morph-surface-grow"));
	expect(
		compiledRule(
			":root[data-vt~=morph-handoff]::view-transition-new(jf-morph)"
		).body
	).toContain("jf-vt-contents-in");
	// The old snapshot is a real overlay, not a ghost: it is never hidden.
	const hidingOld = RULES.filter(
		(rule) =>
			rule.body.includes("opacity: 0") &&
			rule.selectors.some((selector) =>
				selector.endsWith("::view-transition-old(jf-morph)")
			)
	);
	for (const rule of hidingOld) {
		expect(rule.selectors.join()).not.toContain("morph-handoff");
	}
});

test("the stylesheet styles every part flight by its class, never a fixed list of names", () => {
	compiledRule(`::view-transition-group(*.${PART_CLASS})`);
	expect(COMPILED).not.toMatch(/jf-morph-part-\d|part-flights/);
});

// --- Keyed field boxes: the box flight ------------------------------------------

const COMPACT_BOX =
	"background-color: rgb(30, 30, 30); border: 1px solid rgb(60, 60, 60); border-radius: 4px";
const WIDE_BOX =
	"background-color: rgb(40, 40, 40); border: 2px solid rgb(70, 70, 70); border-radius: 8px";
const CLEAR_COLOR = /^(?:transparent|rgba\(0, 0, 0, 0\))$/;

/** A keyed value `id` holding a field: a bare wrapper (`id-box`, painted
 *  with `box`) around its input, beside a hint that is not part of it. */
function keyedField(id: string, key: string, box: string): HTMLElement {
	const value = marked(id, MORPH_KEY, key);
	const wrapper = document.createElement("div");
	wrapper.id = `${id}-box`;
	wrapper.setAttribute("style", box);
	wrapper.append(document.createElement("input"));
	const hint = document.createElement("kbd");
	hint.id = `${id}-hint`;
	value.append(wrapper, hint);
	return value;
}

function compactField(id: string, key: string): HTMLElement {
	return keyedField(id, key, COMPACT_BOX);
}

function wideField(id: string, key: string): HTMLElement {
	return keyedField(id, key, WIDE_BOX);
}

/** A row and a sheet, each holding a value per key, made by `cell` and
 *  `field`. */
function fieldEnds(
	keys: string[],
	cell: (id: string, key: string) => HTMLElement,
	field: (id: string, key: string) => HTMLElement
): { row: HTMLElement; sheet: HTMLElement } {
	const row = asRow(element("row"));
	const sheet = styled("sheet", CARD);
	keys.forEach((key, index) => {
		row.append(cell(`cell-${index}`, key));
		sheet.append(field(`field-${index}`, key));
	});
	return { row, sheet };
}

/** Every box-flight var on <html> that has a value, by name. */
function boxVariables(): Record<string, string> {
	const held: Record<string, string> = {};
	for (const slot of BOX_SLOT_VARS) {
		for (const name of [
			...Object.values(slot.from),
			...Object.values(slot.to),
		]) {
			const value = rootVariable(name);
			if (value) held[name] = value;
		}
	}
	return held;
}

/** Names, view-transition classes and box vars at each snapshot. */
function recordBoxes() {
	type Snapshot = {
		names: Record<string, string>;
		classes: Record<string, string>;
		vars: Record<string, string>;
	};
	const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
	function take(): Snapshot {
		return {
			names: heldNames(),
			classes: heldClasses(),
			vars: boxVariables(),
		};
	}
	fakeViewTransitions({
		onStart: () => seen.old.push(take()),
		onSnapshot: () => seen.new.push(take()),
	});
	return seen;
}

const BOX_FLIGHT = `${PART_CLASS} ${BOX_CLASS} ${boxSlotClass(0)}`;

test("a keyed pair of fields takes the box flight: each end's box is named, the new one carries the box class, its surface goes on <html>", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(["score"], compactField, wideField);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-score": "cell-0-box",
	});
	expect(seen.new[0].names).toMatchObject({
		"jf-morph-part-score": "field-0-box",
	});
	expect(seen.new[0].classes).toEqual({ "field-0-box": BOX_FLIGHT });
	const [slot] = BOX_SLOT_VARS;
	expect(seen.new[0].vars).toEqual({
		[slot.from.background]: "rgb(30, 30, 30)",
		[slot.from.borderColor]: "rgb(60, 60, 60)",
		[slot.from.borderWidth]: "1px",
		[slot.from.radius]: "4px",
		[slot.to.background]: "rgb(40, 40, 40)",
		[slot.to.borderColor]: "rgb(70, 70, 70)",
		[slot.to.borderWidth]: "2px",
		[slot.to.radius]: "8px",
	});
});

test("a pair of plain texts keeps the text flight: no box class, no box vars", async () => {
	const seen = recordBoxes();
	const row = rowWithCells(["status"]);
	const sheet = sheetWithFields(["status"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].vars).toEqual({});
	expect(seen.new[0].classes).toEqual({ "field-0": PART_CLASS });
});

/** A keyed value `id` that is a painted pill (`id-pill`) and nothing else. */
function pillValue(id: string, key: string, box: string): HTMLElement {
	const value = marked(id, MORPH_KEY, key);
	const pill = document.createElement("b");
	pill.id = `${id}-pill`;
	pill.setAttribute("style", box);
	pill.textContent = "Done";
	value.append(pill);
	return value;
}

test("a keyed value that is a painted pill takes the box flight, named on the pill", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(
		["status"],
		(id, key) => pillValue(id, key, COMPACT_BOX),
		(id, key) => pillValue(id, key, WIDE_BOX)
	);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-status": "cell-0-pill",
	});
	expect(seen.new[0].classes).toEqual({ "field-0-pill": BOX_FLIGHT });
	const [slot] = BOX_SLOT_VARS;
	expect(seen.new[0].vars[slot.from.background]).toBe("rgb(30, 30, 30)");
	expect(seen.new[0].vars[slot.to.background]).toBe("rgb(40, 40, 40)");
});

test("a pill that is only part of a value flies as text with the value: it is never named on its own", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(
		["status"],
		(id, key) => {
			const value = pillValue(id, key, COMPACT_BOX);
			value.append(" since Monday");
			return value;
		},
		(id, key) => marked(id, MORPH_KEY, key)
	);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-status": "cell-0",
	});
	expect(seen.new[0].classes).toEqual({ "field-0": PART_CLASS });
	expect(seen.new[0].vars).toEqual({});
});

test("a field flying into plain text still takes the box flight: its frame fades out on the way", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(["score"], compactField, (id, key) =>
		marked(id, MORPH_KEY, key)
	);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].classes).toEqual({ "field-0": BOX_FLIGHT });
	const [slot] = BOX_SLOT_VARS;
	const { vars } = seen.new[0];
	expect(vars[slot.from.background]).toBe("rgb(30, 30, 30)");
	expect(vars[slot.to.background]).toMatch(CLEAR_COLOR);
	expect(vars[slot.to.borderColor]).toMatch(CLEAR_COLOR);
	expect(vars[slot.to.radius]).toBe("4px");
});

test("a close flies the sheet's field box back into the row's", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(["score"], compactField, wideField);
	await morph({
		from: sheet,
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].names).toMatchObject({
		"jf-morph-part-score": "field-0-box",
	});
	expect(seen.new[0].classes).toEqual({ "cell-0-box": BOX_FLIGHT });
	const [slot] = BOX_SLOT_VARS;
	expect(seen.new[0].vars[slot.from.background]).toBe("rgb(40, 40, 40)");
	expect(seen.new[0].vars[slot.to.background]).toBe("rgb(30, 30, 30)");
});

test("past the last slot a field pair keeps the text flight", async () => {
	const seen = recordBoxes();
	const keys = Array.from(
		{ length: MORPH_BOX_SLOTS + 1 },
		(_, index) => `col${index}`
	);
	const { row, sheet } = fieldEnds(keys, compactField, wideField);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].classes).toEqual(
		Object.fromEntries(
			keys.map((_, index) => [
				`field-${index}-box`,
				index < MORPH_BOX_SLOTS
					? `${PART_CLASS} ${BOX_CLASS} ${boxSlotClass(index)}`
					: PART_CLASS,
			])
		)
	);
});

test("the box flight's vars and class are gone after cleanup", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(["score"], compactField, wideField);
	await morph({ from: row, to: () => sheet, update: () => {} });
	const [slot] = BOX_SLOT_VARS;
	expect(Object.keys(seen.new[0].vars)).toHaveLength(
		Object.keys(slot.from).length + Object.keys(slot.to).length
	);
	expect(boxVariables()).toEqual({});
	expect(heldClasses()).toEqual({});
	expect(heldNames()).toEqual({});
});

test("a morph that draws no surface flies its fields as text", async () => {
	const seen = recordBoxes();
	const { row, sheet } = fieldEnds(["score"], compactField, wideField);
	// A close joined after the running transition's old snapshot: its
	// values still fly, but no surface is drawn.
	await viewTransition(() => {
		void morph({
			from: sheet,
			to: () => row,
			direction: "close",
			update: () => {},
		});
	});
	expect(seen.new[0].names).toHaveProperty("jf-morph-part-score");
	expect(seen.new[0].vars).toEqual({});
	expect(Object.values(seen.new[0].classes)).not.toContain(BOX_FLIGHT);
});

/** Every inline property `node` carries. */
function inlineProperties(node: HTMLElement): string[] {
	return Array.from({ length: node.style.length }, (_, index) =>
		node.style.item(index)
	);
}

/** What a flight's naming may put on a live element: paint-neutral. */
const NAMING = new Set(["view-transition-name", "view-transition-class"]);

test.each(["open", "close"] as const)(
	"nothing lands on a live element before the old snapshot (%s): the boxes keep their own style, <html> gets no box vars",
	async (direction) => {
		const { row, sheet } = fieldEnds(["score"], compactField, wideField);
		// Inside both ends (an open's row itself takes only its pin, above).
		const live = [row, sheet].flatMap((end) => [
			...end.querySelectorAll<HTMLElement>("*"),
		]);
		const sourceBox = direction === "open" ? "cell-0-box" : "field-0-box";
		const before = new Map(
			live.map((node) => [
				node,
				{
					props: inlineProperties(node),
					attributes: node.getAttributeNames(),
				},
			])
		);
		const added: Record<string, string[]> = {};
		let variablesAtStart: Record<string, string> = { unread: "" };
		let sourceClass = "";
		fakeViewTransitions({
			onStart: () => {
				variablesAtStart = boxVariables();
				sourceClass = document
					.getElementById(sourceBox)!
					.style.getPropertyValue("view-transition-class");
				for (const node of live) {
					const was = before.get(node)!;
					added[node.id] = [
						...inlineProperties(node).filter(
							(name) =>
								!was.props.includes(name) && !NAMING.has(name)
						),
						// `style` itself: its properties are checked above.
						...node
							.getAttributeNames()
							.filter(
								(name) =>
									name !== "style" &&
									!was.attributes.includes(name)
							),
					];
				}
			},
		});
		await morph(
			direction === "open"
				? { from: row, to: () => sheet, update: () => {} }
				: { from: sheet, to: () => row, direction, update: () => {} }
		);
		expect(variablesAtStart).toEqual({});
		expect(Object.values(added).flat()).toEqual([]);
		// The box class goes on the new end only, after the old snapshot.
		expect(sourceClass).toBe(PART_CLASS);
	}
);

test("the stylesheet draws a box flight's surface for every slot, and fades its snapshots like the card's content", () => {
	for (let slot = 0; slot < MORPH_BOX_SLOTS; slot += 1) {
		// Whitespace dropped: a custom property keeps its value's line breaks.
		const body = compiledRule(
			`::view-transition-image-pair(*.${boxSlotClass(slot)})`
		).body.replaceAll(/\s+/g, "");
		const { from, to } = BOX_SLOT_VARS[slot];
		for (const key of Object.keys(from) as (keyof typeof from)[]) {
			expect(body).toContain(
				`${SURFACE_FROM_VARS[key]}:var(${from[key]})`
			);
			expect(body).toContain(`${SURFACE_TO_VARS[key]}:var(${to[key]})`);
		}
	}
	expect(
		ruleIndex(
			`::view-transition-image-pair(*.${boxSlotClass(MORPH_BOX_SLOTS)})`
		)
	).toBe(-1);
	for (const kind of ["grow", "shrink"]) {
		const selector = `:root[data-vt~=morph-${kind}]::view-transition-image-pair(*.${BOX_CLASS})`;
		const bodies = RULES.filter((rule) =>
			rule.selectors.includes(selector)
		).map((rule) => rule.body);
		expect(bodies.join("")).toContain(`jf-vt-morph-surface-${kind}`);
	}
	expect(
		compiledRule(`:root[data-vt]::view-transition-old(*.${BOX_CLASS})`).body
	).toContain("jf-vt-fade-out var(--jf-animation-duration-fast)");
	expect(
		compiledRule(`:root[data-vt]::view-transition-new(*.${BOX_CLASS})`).body
	).toContain("jf-vt-contents-in var(--jf-animation-duration-morph)");
});

// --- Overlays under the morphing one --------------------------------------------

/** An open overlay's content, as the overlay layer marks it while shown. */
function layer(id: string): HTMLElement {
	const node = styled(id, `${CARD}; overflow: visible`);
	node.setAttribute(MORPH_LAYER, "");
	return node;
}

test("an overlay under the one closing is named in both snapshots, so it un-stacks as its own group", async () => {
	const seen = recordSurface();
	const sheet = layer("sheet");
	const button = styled("button", CARD, "button");
	sheet.append(button);
	const dialog = layer("dialog");
	await morph({
		from: dialog,
		to: () => button,
		direction: "close",
		update: () => {
			dialog.removeAttribute(MORPH_LAYER);
		},
	});
	expect(seen.old[0].names).toEqual({
		"jf-morph": "dialog",
		[stackedName(0)]: "sheet",
	});
	expect(seen.new[0].names).toEqual({
		"jf-morph": "ghost",
		"jf-morph-source": "button",
		[stackedName(0)]: "sheet",
	});
	expect(seen.new[0].classes.sheet).toBe(STACKED_CLASS);
	expect(heldNames()).toEqual({});
	expect(heldClasses()).toEqual({});
});

test("an overlay under the one opening is named in both snapshots, so it steps back as its own group", async () => {
	const seen = recordSurface();
	const sheet = layer("sheet");
	const icon = styled("icon", "background-color: transparent", "button");
	sheet.append(icon);
	const card = styled("card", CARD);
	await morph({ from: icon, to: () => card, update: () => {} });
	expect(seen.old[0].names).toEqual({
		"jf-morph": "ghost",
		[stackedName(0)]: "sheet",
	});
	expect(seen.new[0].names).toEqual({
		"jf-morph": "card",
		[stackedName(0)]: "sheet",
	});
});

test("every overlay under the morphing one takes a name of its own", async () => {
	const seen = recordSurface();
	layer("lowest");
	layer("middle");
	const dialog = layer("dialog");
	await morph({
		from: dialog,
		to: () => null,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].names).toEqual({
		[stackedName(0)]: "lowest",
		[stackedName(1)]: "middle",
	});
});

test("a morph joining a transition already running names no overlay under it: it would be in the new snapshot only", async () => {
	const seen = recordSurface();
	layer("sheet");
	const card = styled("card", CARD);
	await viewTransition(() => {
		void morph({ from: null, to: () => card, update: () => {} });
	});
	expect(seen.new[0].names).toEqual({ "jf-morph": "card" });
});

test("a close reads its target's box after the update: where it rests once the overlay under it has un-stacked", async () => {
	vi.stubGlobal("innerWidth", 1000);
	vi.stubGlobal("innerHeight", 800);
	const widths: string[] = [];
	fakeViewTransitions({
		onSnapshot: () => {
			const ghost = document.querySelector<HTMLElement>(
				`[${MORPH_GHOST}]`
			);
			widths.push(
				ghost?.style.getPropertyValue(GHOST_GEOMETRY_VARS.width) ?? ""
			);
		},
	});
	const sheet = layer("sheet");
	const button = styled("button", CARD, "button");
	sheet.append(button);
	placeAt(sheet, 0, 0, 500, 500);
	const dialog = layer("dialog");
	let isStacked = true;
	vi.spyOn(button, "getBoundingClientRect").mockImplementation(() =>
		isStacked ? new DOMRect(10, 10, 96, 40) : new DOMRect(0, 0, 100, 40)
	);
	await morph({
		from: dialog,
		to: () => button,
		direction: "close",
		update: () => {
			isStacked = false;
		},
	});
	expect(widths).toEqual(["100px"]);
});

test("an overlay under the morph moves on the morph's duration and curve, under the scrim", () => {
	const group = `::view-transition-group(*.${STACKED_CLASS})`;
	expect(zIndexOf(group)).toBeLessThan(
		zIndexOf("::view-transition-group(jf-morph-scrim)")
	);
	const { body } = compiledRule(group);
	expect(body).toContain(
		"animation-duration: var(--jf-animation-duration-morph)"
	);
	expect(body).toContain(
		"animation-timing-function: var(--jf-animation-ease-standard)"
	);
});
