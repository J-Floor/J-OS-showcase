import { ENTITY_ROW } from "./morphPairing.ts";
import { hasLayoutBox } from "./visibleArea.ts";

/**
 * The element a person last activated: an overlay that opens right after
 * morphs out of it. One capture listener, a reference and a timestamp; no work
 * per element.
 *
 * Only an activation within {@link ACTIVATION_TTL_MS} counts, so a sheet opened
 * by a shortcut does not grow out of a button clicked minutes earlier.
 */
export const ACTIVATION_TTL_MS = 1000;

const ACTIVATABLE = `button, a, ${ENTITY_ROW}`;

let last: { element: HTMLElement; at: number } | undefined;

/** What a widget holding focus for its items (a grid's ring row) names as
 *  its current item through `aria-activedescendant`; the key acts on that
 *  item, not on the widget. */
function activeDescendant(target: Element): Element | null {
	const id = target.getAttribute("aria-activedescendant");
	return id ? target.ownerDocument.getElementById(id) : null;
}

function record(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const acted =
		(event.type === "keydown" ? activeDescendant(target) : null) ?? target;
	const element = acted.closest<HTMLElement>(ACTIVATABLE);
	if (element) last = { element, at: Date.now() };
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key === "Enter" || event.key === " ") record(event);
}

/** Installs the capture listeners; returns an uninstall function. */
export function trackActivation(target: Document = document): () => void {
	target.addEventListener("pointerdown", record, { capture: true });
	target.addEventListener("keydown", onKeyDown, { capture: true });
	return () => {
		target.removeEventListener("pointerdown", record, { capture: true });
		target.removeEventListener("keydown", onKeyDown, { capture: true });
		last = undefined;
	};
}

/** The element activated within ACTIVATION_TTL_MS, if still connected and rendered. */
export function recentActivation(): HTMLElement | null {
	if (!last || Date.now() - last.at > ACTIVATION_TTL_MS) return null;
	return hasLayoutBox(last.element) ? last.element : null;
}
