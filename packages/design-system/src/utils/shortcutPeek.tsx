import { makeEventListener } from "@solid-primitives/event-listener";
import { createKeyHold } from "@tanstack/solid-hotkeys";
import {
	createContext,
	createSignal,
	onMount,
	useContext,
	type JSX,
} from "solid-js";

type PeekContext = {
	/** Whether shortcut chips should be showing right now. */
	peeking: () => boolean;
	/** Whether the toggle (rather than the held key) is what is holding them on. */
	latched: () => boolean;
	toggleLatched: () => void;
};

/**
 * `undefined` rather than a default object: a component that reads this outside
 * a provider gets a permanent `false` from the hook below, which is what a
 * design-system component rendered in isolation (a demo, a test) should see.
 */
const Context = createContext<PeekContext>();

/**
 * Holds the one "shortcut chips are visible" boolean for the whole page.
 *
 * Two things can raise it and they are independent: holding Alt (transient, the
 * Windows access-key idiom) and a toggle control (sticky). Either alone is
 * enough, so releasing Alt does not switch off a latched peek.
 */
export function ShortcutPeekProvider(props: {
	children: JSX.Element;
}): JSX.Element {
	const [latched, setLatched] = createSignal(false);
	const isAltHeld = createKeyHold("Alt");

	/**
	 * On Windows and Linux a bare Alt press-and-release focuses the browser's
	 * menu bar, which takes focus out of the page — so the very act of peeking
	 * would break the next keystroke. macOS has no menu-bar activation, which is
	 * exactly why this is easy to miss.
	 */
	onMount(() => {
		// Apple platforms have no menu-bar activation, and there Alt is Option —
		// a text-entry modifier. Swallowing it would be pointless at best and
		// eat Option input at worst, so install this only where the menu-bar
		// problem actually exists.
		if (/Mac|iPhone|iPad|iPod/.test(navigator.platform)) return;
		// eslint-disable-next-line unicorn/consistent-function-scoping -- addEventListener dedupes a shared listener reference, so each provider needs its own or one unmounting would remove another's
		function swallowAlt(event: KeyboardEvent): void {
			if (event.key === "Alt") event.preventDefault();
		}
		makeEventListener(document, "keydown", swallowAlt);
		makeEventListener(document, "keyup", swallowAlt);
	});

	const value: PeekContext = {
		peeking: () => latched() || isAltHeld(),
		latched,
		toggleLatched: () => {
			setLatched((on) => !on);
		},
	};
	return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

/** Read the peek state. Off, permanently, outside a provider. */
export function useShortcutPeek(): PeekContext {
	return (
		useContext(Context) ?? {
			peeking: () => false,
			latched: () => false,
			toggleLatched: () => {
				// No provider, nothing to latch.
			},
		}
	);
}
