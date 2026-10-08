import {
	formatForDisplay,
	type Hotkey,
	type Modifier,
} from "@tanstack/solid-hotkeys";
import clsx from "clsx";
import { For, Show, type JSX } from "solid-js";

import { useShortcutPeek } from "../ShortcutPeek/ShortcutPeek.tsx";

import styles from "./Kbd.module.scss";

/** The separator we ask `formatForDisplay` for, so splitting its output is not
 *  platform-dependent. Left to its default it returns "⌘ ⇧ S" on macOS and
 *  "Ctrl+Shift+S" elsewhere — splitting on either one breaks the other. */
const SEPARATOR = " ";

type KbdShared = {
	class?: string;
	/**
	 * A chip sitting inside a button rather than in its tooltip. Inline chips
	 * appear only while peeking (Alt held, or the topbar toggle latched) —
	 * always-on chips would add a keyboard hint to every button on screen, and
	 * `DecisionBar` is already fighting for width at 480px.
	 */
	inline?: boolean;
	/**
	 * What the shortcut does, in words ("to open"). The chip and its words
	 * become one hint that shows and hides together: on a touch screen the
	 * chip is hidden, and words left behind would read "to open" with nothing
	 * before it. Omit for a chip that stands alone (a tooltip, a button).
	 */
	children?: JSX.Element;
};

export type KbdProps = KbdShared &
	(
		| {
				/**
				 * The same typed hotkey string the binding registers, so the hint
				 * on screen and the key that fires come from one place. `Mod`
				 * renders as ⌘ on macOS and Ctrl elsewhere.
				 *
				 * A lone `Modifier` (e.g. `Alt`) is allowed too, for a control
				 * whose hint is the modifier itself rather than a chord — `Alt`
				 * renders as ⌥ on macOS and "Alt" elsewhere. It is display only; a
				 * bare modifier is not a registrable `Hotkey`, so nothing binds to
				 * it.
				 */
				shortcut: Hotkey | Modifier;
				label?: undefined;
		  }
		| {
				/**
				 * A display-only chip whose text is not a single formatted hotkey
				 * — e.g. "0–9" for "type any digit". No binding, purely a hint;
				 * use `shortcut` whenever a real key drives it.
				 */
				label: string;
				shortcut?: undefined;
		  }
	);

/**
 * A keyboard shortcut, with the right glyphs for the platform — ⌘K on a Mac,
 * Ctrl K everywhere else.
 *
 * Each glyph is its own nested `<kbd>`: that is what the element means, and it
 * is why the modifier and the key read as two keys to press rather than running
 * together into "CtrlK".
 *
 * `role="group"` with the raw hotkey as its label: the glyphs are decorative to
 * a screen reader, which would otherwise read "⌘" as nothing at all.
 */
export function Kbd(props: KbdProps): JSX.Element {
	const peek = useShortcutPeek();
	function glyphs(): string[] {
		// A `label` is a literal chip (a range, a word) — shown as one key, not
		// split into per-glyph keys the way a formatted hotkey is.
		if (props.label !== undefined) return [props.label];
		return formatForDisplay(props.shortcut, {
			separatorToken: SEPARATOR,
		}).split(SEPARATOR);
	}
	function ariaLabel(): string {
		return props.label ?? props.shortcut;
	}
	function visible(): boolean {
		return !props.inline || peek.peeking();
	}
	const chip = (
		<kbd
			role="group"
			aria-label={ariaLabel()}
			class={clsx(styles.kbd, !props.children && props.class)}
		>
			<For each={glyphs()}>
				{(glyph) => (
					<kbd aria-hidden="true" class={styles.key}>
						{glyph}
					</kbd>
				)}
			</For>
		</kbd>
	);
	return (
		<Show when={visible()}>
			<Show when={props.children} fallback={chip}>
				<span class={clsx(styles.hint, props.class)}>
					{chip} {props.children}
				</span>
			</Show>
		</Show>
	);
}
