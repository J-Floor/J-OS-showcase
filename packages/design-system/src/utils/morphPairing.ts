/**
 * The morph vocabulary: which entity an element shows (`Morph`, a table row),
 * where a sheet closes into, and what flies on its own inside a morph's ends
 * (the title, and each value paired with the other end's value showing the
 * same field). See morph.ts.
 */
import { MORPH_KEY, MORPH_OF, MORPH_TITLE } from "./morphNames.ts";
import { hasLayoutBox } from "./visibleArea.ts";

export { MORPH_KEY, MORPH_OF, MORPH_TITLE };

/** An element that shows one entity and is a surface by what it is,
 *  whatever it paints: a table row, a `Morph`. */
export const ENTITY_SURFACE = `[role="row"], [${MORPH_OF}]`;

/** An element that shows one entity: an {@link ENTITY_SURFACE}, or a
 *  listbox option (a palette result, which paints only while highlighted). */
export const ENTITY_ROW = `${ENTITY_SURFACE}, [role="option"]`;

/** The on-screen element showing this entity, if any. */
export function findMorphTarget(of: string): HTMLElement | null {
	const matches = [
		...document.querySelectorAll<HTMLElement>(
			`[${MORPH_OF}="${CSS.escape(of)}"]`
		),
	].filter(hasLayoutBox);
	if (matches.length > 1 && import.meta.env.DEV) {
		// eslint-disable-next-line no-console -- a warning for the developer, not the user
		console.warn(
			`Several elements show ${of}; closing into the first.`,
			matches
		);
	}
	return matches[0] ?? null;
}

/** Spread on the element holding a morph source's or target's title. */
export const morphTitle = { [MORPH_TITLE]: "" } as const;

/**
 * Marks a sheet's loading skeleton (either variant), also the hook a test
 * asserts "a skeleton is showing" on. Nothing inside it takes part in a
 * morph: it is replaced by the real content mid-animation, and a named
 * element that stops being rendered makes the browser skip the whole
 * transition.
 */
export const SHEET_SKELETON = "data-sheet-skeleton";

/**
 * Whether `element`, inside the morph end `root`, flies: not placeholder
 * content (it is replaced mid-animation), and not a value of another entity
 * shown inside the end (a card listed inside a sheet).
 */
function takesPart(root: HTMLElement | null, element: HTMLElement): boolean {
	if (element.closest(`[${SHEET_SKELETON}]`)) return false;
	// A closed section keeps its content mounted but `hidden`: it shows
	// nothing to fly. The end itself may still be `hidden` as it opens (Ark
	// drops it a tick after the open), so only a hidden part inside it counts.
	const hidden = element.closest<HTMLElement>("[hidden]");
	if (hidden && hidden !== root && root?.contains(hidden) === true)
		return false;
	const entity = element.closest<HTMLElement>(`[${MORPH_OF}]`);
	return (
		entity === null || entity === root || root?.contains(entity) !== true
	);
}

/** The end's title. One whose text is split into keyed values (a person
 *  sheet's first and last name) is not one: its halves fly instead. */
export function titleIn(element: HTMLElement | null): HTMLElement | null {
	const titles =
		element?.querySelectorAll<HTMLElement>(`[${MORPH_TITLE}]`) ?? [];
	return (
		[...titles].find(
			(title) =>
				takesPart(element, title) &&
				title.querySelector(`[${MORPH_KEY}]`) === null
		) ?? null
	);
}

/** The key an element shows: its own, or a keyed title's. */
function keyOf(element: HTMLElement): string {
	return (
		element.getAttribute(MORPH_KEY) ??
		element.getAttribute(MORPH_TITLE) ??
		""
	);
}

function warnDuplicateKey(key: string): void {
	if (!import.meta.env.DEV) return;
	// eslint-disable-next-line no-console -- a warning for the developer, not the user
	console.warn(
		`morph: the field "${key}" is marked twice in one morph end; only the first flies.`
	);
}

/**
 * The keyed values inside `root` that take part, first of each key, in
 * order (a later duplicate warns in dev). In a target (`isTarget`), a keyed
 * title counts as the value with its key: a sheet's first-name half closes
 * into the row's title cell. A source's title flies as the title.
 */
export function keyedValues(
	root: HTMLElement | null,
	isTarget = false
): Map<string, HTMLElement> {
	const values = new Map<string, HTMLElement>();
	const selector = isTarget
		? `[${MORPH_KEY}], [${MORPH_TITLE}]:not([${MORPH_TITLE}=""])`
		: `[${MORPH_KEY}]`;
	const keyed = root?.querySelectorAll<HTMLElement>(selector) ?? [];
	for (const element of keyed) {
		const key = keyOf(element);
		if (key === "" || !takesPart(root, element)) continue;
		if (values.has(key)) warnDuplicateKey(key);
		else values.set(key, element);
	}
	return values;
}
