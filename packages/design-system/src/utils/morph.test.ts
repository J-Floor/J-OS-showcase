// @vitest-environment happy-dom
import { readFileSync } from "node:fs";

import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import {
	captureSurfaced,
	fakeViewTransitions,
	installViewTransitions,
	namedIds,
	restoreViewTransitions,
} from "../test/viewTransitionFakes.ts";

import {
	MAX_PART_FLIGHTS,
	MORPH_GHOST,
	MORPH_SCRIM,
	MORPH_STRIPPED,
	claimHandoff,
	hasContainer,
	morph,
} from "./morph.ts";
import { MORPH_KEY, MORPH_TITLE, SHEET_SKELETON } from "./morphPairing.ts";
import { viewTransition } from "./viewTransition.ts";

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
			const wasClaimed = claimHandoff(() => sheet);
			expect(wasClaimed).toBe(true);
			void morph({
				from: null,
				to: () => sheet,
				claimed: wasClaimed,
				update: () => {},
			});
		},
	});
	expect(seen).toEqual([["sheet"]]);
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
	const wasClaimed = claimHandoff(() => sheet);
	expect(wasClaimed).toBe(true);
	void morph({
		from: null,
		to: () => sheet,
		claimed: true,
		update: () => {},
	});
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
			const wasClaimed = claimHandoff(() => null);
			expect(wasClaimed).toBe(true);
			void morph({
				from: null,
				to: () => sheet,
				claimed: wasClaimed,
				update: () => {},
			});
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
	expect(claimHandoff(() => palette)).toBe(false);
	let wasClaimed: boolean | undefined;
	await viewTransition(() => {
		wasClaimed = claimHandoff(() => palette);
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
	title.setAttribute("data-morph-title", "");
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
			const wasClaimed = claimHandoff(() => sheet);
			void morph({
				from: null,
				to: () => sheet,
				claimed: wasClaimed,
				update: () => {},
			});
		},
	});
	expect(seen.new).toEqual([["sheet"]]);
	expect(seen.kinds).toEqual(["morph morph-box"]);
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
			wasClaimed = claimHandoff(() => element("sheet"));
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
		stripped: string[];
	};
	const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
	function take(): Snapshot {
		return {
			names: heldNames(),
			kinds: document.documentElement.dataset.vt ?? "",
			from: rootVariable("--jf-morph-from-background"),
			to: rootVariable("--jf-morph-to-background"),
			ghosts: document.querySelectorAll(`[${MORPH_GHOST}]`).length,
			pins: document.querySelectorAll("[data-morph-pinned]").length,
			stripped: [
				...document.querySelectorAll<HTMLElement>(
					`[${MORPH_STRIPPED}]`
				),
			].map((node) => node.id),
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

test("a container source: a ghost of its surface grows into the target", async () => {
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
	expect(rootVariable("--jf-morph-from-background")).toBe("");
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

test("a close into a container: the card shrinks into a ghost of its surface", async () => {
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
 *  positioner around its card. `isMarked`: the scrim fades with the morph. */
function overlay(isMarked = true): { card: HTMLElement; scrim: HTMLElement } {
	const portal = element("portal");
	const scrim = document.createElement("div");
	scrim.id = "scrim";
	if (isMarked) scrim.setAttribute(MORPH_SCRIM, "");
	const positioner = document.createElement("div");
	const card = styled("card", CARD);
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

test("an unmarked scrim, or a scale-look open, keeps its own fade", async () => {
	const seen = recordSurface();
	const plain = overlay(false);
	await morph({
		from: styled("source", FILLED, "button"),
		to: () => plain.card,
		update: () => {},
	});
	document.body.replaceChildren();
	const marked = overlay();
	await morph({
		from: textField("field"),
		to: () => marked.card,
		update: () => {},
	});
	expect(
		seen.new.map((snapshot) => snapshot.names["jf-morph-scrim"])
	).toEqual([undefined, undefined]);
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
		"jf-morph-part-0": "cell-0",
		"jf-morph-part-1": "cell-1",
	});
	expect(seen.new[0].names).toMatchObject({
		"jf-morph-part-0": "field-1",
		"jf-morph-part-1": "field-0",
	});
});

test("keys pair exactly: another case or spelling does not fly", async () => {
	const seen = recordSurface();
	const row = rowWithCells(["status", "owner"]);
	const sheet = sheetWithFields(["status", "Owner"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names).toEqual({
		"jf-morph": "sheet",
		"jf-morph-part-0": "field-0",
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
	expect(seen.new[0].names["jf-morph-part-0"]).toBeUndefined();
});

test("the same key twice in one end: the first wins, with a dev warning", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const seen = recordSurface();
	const row = rowWithCells(["status"]);
	const sheet = sheetWithFields(["status", "status"]);
	await morph({ from: row, to: () => sheet, update: () => {} });
	expect(seen.new[0].names["jf-morph-part-0"]).toBe("field-0");
	expect(warn).toHaveBeenCalledWith(expect.stringContaining('"status"'));
});

test("at most eight values fly", async () => {
	const seen = recordSurface();
	const keys = Array.from({ length: 10 }, (_, index) => `col${index}`);
	const row = rowWithCells(keys);
	const sheet = sheetWithFields(keys);
	await morph({ from: row, to: () => sheet, update: () => {} });
	const parts = Object.keys(seen.new[0].names).filter((name) =>
		name.startsWith("jf-morph-part-")
	);
	expect(parts).toHaveLength(8);
	expect(seen.new[0].names["jf-morph-part-7"]).toBe("field-7");
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
	expect(seen.new[0].names["jf-morph-part-0"]).toBe("field-0");
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
	card.setAttribute("data-morph-of", "task-1");
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
		"jf-morph-part-0": "first-half",
		"jf-morph-part-1": "last-half",
	});
	expect(Object.values(seen.old[0].names)).not.toContain("sheet-title");
	expect(seen.new[0].names).toMatchObject({
		"jf-morph-part-0": "cell-title",
		"jf-morph-part-1": "cell-last",
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

test("a close resolves its target once, and the title from that target", async () => {
	const seen = recordBothSnapshots();
	const sheet = withTitle("sheet", "title");
	const row = withTitle("row", "cell");
	row.setAttribute("role", "row");
	const to = vi.fn(() => row);
	await morph({ from: sheet, to, direction: "close", update: () => {} });
	expect(to).toHaveBeenCalledTimes(1);
	expect(seen.old).toEqual([["sheet", "title"]]);
	expect(seen.new[0]).toEqual(expect.arrayContaining(["row", "cell"]));
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
	expect(seen.old[0].stripped).toEqual([]);
	expect(seen.new[0].stripped).toEqual([]);
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

// --- The hover pin ------------------------------------------------------------

const PINNED = "data-morph-pinned";
const HOVER = "rgb(43, 43, 43)";

/** The pin rule of viewTransition.scss, for this test. */
function installPinRule(): void {
	const rule = document.createElement("style");
	rule.textContent = `[${PINNED}] { background-color: var(--jf-morph-pin-bg) !important; border-color: var(--jf-morph-pin-border) !important; }`;
	document.head.append(rule);
	onTestFinished(() => {
		rule.remove();
	});
}

test("an open pins its source's look for the transition, then lets go", async () => {
	installPinRule();
	const row = asRow(element("row"));
	row.style.setProperty("background-color", HOVER);
	row.style.setProperty("border", "1px solid rgb(1, 2, 3)");
	const plainCell = document.createElement("span");
	const stickyCell = document.createElement("span");
	stickyCell.style.setProperty("background-color", HOVER);
	row.append(plainCell, stickyCell);
	const pinned: Record<string, string | boolean>[] = [];
	fakeViewTransitions({
		onStart: () => {
			// Chrome drops :hover as the transition starts.
			row.style.removeProperty("background-color");
			pinned.push({
				row: row.hasAttribute(PINNED),
				bg: row.style.getPropertyValue("--jf-morph-pin-bg"),
				painted: getComputedStyle(row).backgroundColor,
				border: row.style.getPropertyValue("--jf-morph-pin-border"),
				plainCell: plainCell.hasAttribute(PINNED),
				stickyCell:
					stickyCell.style.getPropertyValue("--jf-morph-pin-bg"),
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
			row: true,
			bg: HOVER,
			painted: HOVER,
			border: "rgb(1, 2, 3) rgb(1, 2, 3) rgb(1, 2, 3) rgb(1, 2, 3)",
			plainCell: false,
			stickyCell: HOVER,
		},
	]);
	for (const node of [row, stickyCell]) {
		expect(node).not.toHaveAttribute(PINNED);
		expect(node.style.getPropertyValue("--jf-morph-pin-bg")).toBe("");
		expect(node.style.getPropertyValue("--jf-morph-pin-border")).toBe("");
	}
});

test("the surface starts from the pinned colour", async () => {
	installPinRule();
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.style.setProperty("background-color", HOVER);
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(seen.new[0].from).toBe(HOVER);
});

test("a pinned hover background does not make an icon button a container", () => {
	installPinRule();
	const icon = styled("icon", "background-color: transparent", "button");
	icon.setAttribute(PINNED, "");
	icon.style.setProperty("--jf-morph-pin-bg", HOVER);
	expect(hasContainer(icon)).toBe(false);
});

test("a close pins nothing", async () => {
	const seen = recordSurface();
	const row = asRow(element("row"));
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	await morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].pins).toBe(0);
});

// --- The surface strip ----------------------------------------------------------

/** A row with a plain cell and a cell that paints its own fill. */
function rowWithFilledCell(): HTMLElement {
	const row = asRow(element("row"));
	row.style.setProperty("background-color", "rgb(5, 5, 5)");
	const plainCell = document.createElement("span");
	plainCell.id = "plain";
	const stickyCell = document.createElement("span");
	stickyCell.id = "sticky";
	stickyCell.style.setProperty("background-color", "rgb(5, 5, 5)");
	row.append(plainCell, stickyCell);
	return row;
}

test("a container source sheds its surface for the old snapshot, the ghost over it", async () => {
	const seen = recordSurface();
	const row = rowWithFilledCell();
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(seen.old[0].stripped).toEqual(["row", "sticky"]);
	expect(seen.old[0].ghosts).toBe(1);
	// The surface still starts from the source's own fill.
	expect(seen.new[0].from).toBe("rgb(5, 5, 5)");
	expect(document.querySelector(`[${MORPH_STRIPPED}]`)).toBeNull();
});

test("the surface comes back without a fade: settling holds the transitions off while the strip goes", async () => {
	fakeViewTransitions();
	const row = rowWithFilledCell();
	const SETTLING = "data-morph-settling";
	const watched = new Set([MORPH_STRIPPED, SETTLING]);
	const changes: string[] = [];
	const set = row.setAttribute.bind(row);
	const remove = row.removeAttribute.bind(row);
	vi.spyOn(row, "setAttribute").mockImplementation((name, value) => {
		if (watched.has(name)) changes.push(`+${name}`);
		set(name, value);
	});
	vi.spyOn(row, "removeAttribute").mockImplementation((name) => {
		if (watched.has(name)) changes.push(`-${name}`);
		remove(name);
	});
	const read = window.getComputedStyle.bind(window);
	vi.spyOn(window, "getComputedStyle").mockImplementation((target) => {
		// The read that applies the surface back while nothing transitions.
		if (target === row && row.hasAttribute(SETTLING)) changes.push("read");
		return read(target);
	});
	onTestFinished(() => {
		vi.restoreAllMocks();
	});
	await morph({
		from: row,
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(changes).toEqual([
		`+${MORPH_STRIPPED}`,
		`+${SETTLING}`,
		`-${MORPH_STRIPPED}`,
		"read",
		`-${SETTLING}`,
	]);
});

test("an icon source is never stripped", async () => {
	const seen = recordSurface();
	const icon = styled("icon", "background-color: transparent", "button");
	await morph({ from: icon, to: () => styled("p", CARD), update: () => {} });
	expect(seen.old[0].stripped).toEqual([]);
	expect(seen.new[0].stripped).toEqual([]);
});

test("a close into a container strips it for the new snapshot, then lets go", async () => {
	const seen = recordSurface();
	const row = rowWithFilledCell();
	await morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	expect(seen.old[0].stripped).toEqual([]);
	expect(seen.new[0].stripped).toEqual(["row", "sticky"]);
	expect(seen.new[0].to).toBe("rgb(5, 5, 5)");
	expect(document.querySelector(`[${MORPH_STRIPPED}]`)).toBeNull();
});

test("a close into an icon strips nothing", async () => {
	const seen = recordSurface();
	const icon = styled("icon", "background-color: transparent", "button");
	await morph({
		from: styled("sheet", CARD),
		to: () => icon,
		direction: "close",
		update: () => {},
	});
	expect(seen.new[0].stripped).toEqual([]);
});

test("a skipped transition lets the strip go", async () => {
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
	await morph({
		from: rowWithFilledCell(),
		to: () => styled("sheet", CARD),
		update: () => {},
	});
	expect(start).toHaveBeenCalled();
	expect(document.querySelector(`[${MORPH_STRIPPED}]`)).toBeNull();
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
		stripped: row.hasAttribute(MORPH_STRIPPED),
		pinned: row.hasAttribute("data-morph-pinned"),
		pinVar: row.style.getPropertyValue("--jf-morph-pin-bg") !== "",
		from: rootVariable("--jf-morph-from-background") !== "",
		to: rootVariable("--jf-morph-to-background") !== "",
		clip: rootVariable("--jf-morph-source-clip") !== "",
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
	const opening = morph({
		from: row,
		to: () => styled("next", CARD),
		update: () => {},
	});
	await transitions.snapshot(1);
	const all = {
		stripped: true,
		pinned: true,
		pinVar: true,
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
		stripped: false,
		pinned: false,
		pinVar: false,
		from: false,
		to: false,
		clip: false,
	});
});

test("a morph that starts on a row the last one still strips reads the row's own surface", async () => {
	// The strip rule as viewTransition.scss has it (the test loads no CSS).
	const sheet = document.createElement("style");
	sheet.textContent = `[${MORPH_STRIPPED}] { background-color: transparent !important; }`;
	document.head.append(sheet);
	onTestFinished(() => {
		sheet.remove();
	});
	const transitions = heldTransitions();
	const row = rowWithFilledCell();
	const closing = morph({
		from: styled("sheet", CARD),
		to: () => row,
		direction: "close",
		update: () => {},
	});
	await transitions.snapshot(0);
	expect(getComputedStyle(row).backgroundColor).toBe("transparent");
	const opening = morph({
		from: row,
		to: () => styled("next", CARD),
		update: () => {},
	});
	await transitions.snapshot(1);
	// The row's fill, not the transparent look the close's strip left on it.
	expect(rootVariable("--jf-morph-from-background")).toBe("rgb(5, 5, 5)");
	// The filled sticky cell is one of the new morph's layers again.
	expect(document.getElementById("sticky")).toHaveAttribute(MORPH_STRIPPED);
	transitions.finish(0);
	transitions.finish(1);
	await Promise.all([closing, opening]);
	expect(document.querySelector(`[${MORPH_STRIPPED}]`)).toBeNull();
});

test("a cleanup that throws still resolves the morph, the error surfaced", async () => {
	fakeViewTransitions();
	const surfaced = captureSurfaced();
	const row = rowWithFilledCell();
	const broken = new Error("cleanup");
	const read = window.getComputedStyle.bind(window);
	vi.spyOn(window, "getComputedStyle").mockImplementation((target) => {
		// The read that gives a stripped element its surface back.
		if (target.hasAttribute("data-morph-settling")) throw broken;
		return read(target);
	});
	await expect(
		morph({ from: row, to: () => styled("sheet", CARD), update: () => {} })
	).resolves.toEqual({ handedOff: false });
	expect(surfaced).toEqual([broken]);
});

// --- The stylesheet -----------------------------------------------------------

const STYLES = readFileSync(
	`${import.meta.dirname}/../styles/viewTransition.scss`,
	"utf8"
);

/** The value of the SCSS variable `$name`. */
function scssNumber(name: string): number {
	const match = new RegExp(String.raw`\$${name}:\s*(\d+);`).exec(STYLES);
	return Number(match?.[1]);
}

/** The rule block that opens with `selector` (ending in `{`), up to its
 *  first `}`. */
function blockAt(selector: string): string {
	const start = STYLES.indexOf(selector);
	const body = start + selector.length;
	return start === -1 ? "" : STYLES.slice(body, STYLES.indexOf("}", body));
}

function zIndexAt(selector: string): string | undefined {
	return /z-index: ([^;]+);/.exec(blockAt(selector))?.[1];
}

test("the scrim paints under the source, the source under the surface, the flying text over it", () => {
	const source = scssNumber("layer-source");
	const surface = scssNumber("layer-surface");
	const text = scssNumber("layer-text");
	expect(scssNumber("layer-scrim")).toBeLessThan(source);
	expect(source).toBeLessThan(surface);
	expect(surface).toBeLessThan(text);
	expect(zIndexAt("::view-transition-group(jf-morph-source) {")).toBe(
		"$layer-source"
	);
	expect(zIndexAt("::view-transition-group(jf-morph-scrim) {")).toBe(
		"$layer-scrim"
	);
	expect(zIndexAt("::view-transition-group(jf-morph) {")).toBe(
		"$layer-surface"
	);
	// The title and each part, from the text-flight mixin.
	expect(zIndexAt("::view-transition-group(#{$name}) {")).toBe("$layer-text");
});

test("a stripped element loses its fill, border, shadow and outline, over the pin", () => {
	const pin = STYLES.indexOf("[data-morph-pinned] {");
	const strip = STYLES.indexOf(`[${MORPH_STRIPPED}]`);
	expect(strip).toBeGreaterThan(pin);
	const block = blockAt(`[${MORPH_STRIPPED}]`);
	for (const declaration of [
		"background: none !important",
		"border-color: transparent !important",
		"box-shadow: none !important",
		"outline: none !important",
	]) {
		expect(block).toContain(declaration);
	}
});

test("a stripped or settling element runs no transition: the strip lands, and leaves, at once", () => {
	expect(blockAt("[data-morph-settling] {")).toContain(
		"transition: none !important"
	);
	expect(STYLES).toMatch(
		/\[data-morph-stripped\],\s*\[data-morph-settling\] \{/
	);
});

test("the stylesheet styles exactly as many part flights as may fly", () => {
	expect(scssNumber("part-flights")).toBe(MAX_PART_FLIGHTS);
});

test("a page change fades through: out first, then in while growing", () => {
	const page = blockAt('[data-vt~="page"]::view-transition-new(jf-page)');
	expect(page).toContain("jf-vt-fade-through-in");
	expect(STYLES).toMatch(/\$page-scale-from:\s*0\.92;/);
});
