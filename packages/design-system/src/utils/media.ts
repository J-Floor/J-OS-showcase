import { type Accessor, createSignal, onCleanup } from "solid-js";

/** The `phone` breakpoint of breakpoints.scss, for code: keep the two equal. */
export const PHONE_QUERY = "(width <= 40rem)";

/**
 * Whether `query` matches, following the viewport. False where there is no
 * `matchMedia` (a server render, a test DOM without it). Call it inside a
 * component or root: the listener goes with its owner.
 */
export function createMediaQuery(query: string): Accessor<boolean> {
	if (typeof matchMedia !== "function") return () => false;
	const list = matchMedia(query);
	const [matches, setMatches] = createSignal(list.matches);
	function onChange(event: MediaQueryListEvent): void {
		setMatches(event.matches);
	}
	// A test double of matchMedia may hand back a bare `{ matches }`.
	if (typeof list.addEventListener !== "function") return matches;
	list.addEventListener("change", onChange);
	onCleanup(() => {
		list.removeEventListener("change", onChange);
	});
	return matches;
}
