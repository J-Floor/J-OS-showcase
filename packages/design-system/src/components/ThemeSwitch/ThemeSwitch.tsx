import { type JSX, Show, onMount } from "solid-js";

import { ICONS } from "../../icons.ts";
import { useTheme } from "../../JFloorProvider.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./ThemeSwitch.module.scss";

/**
 * Light/dark toggle. The glyph is derived straight from the current theme so it
 * is always correct, including the very first render (ark's `Swap` didn't honour
 * its initial state on mount). Reads/drives the theme via {@link useTheme}.
 */
export function ThemeSwitch(): JSX.Element {
	const { theme, toggle } = useTheme();
	function isDark() {
		return theme() === "dark";
	}
	// The keyed <Show> re-creates the glyph span on every toggle (→ rotate-in)
	// AND on every mount. Animate only AFTER the initial mount, so re-mounting
	// the switch (e.g. on navigation) doesn't replay the intro — only a real
	// toggle does. `mounted` is read at span-creation time, no reactivity needed.
	let mounted = false;
	onMount(() => {
		mounted = true;
	});
	function iconClass(): string {
		return mounted ? `${styles.icon} ${styles.animate}` : styles.icon;
	}
	return (
		<Tooltip
			tooltipContent="Toggle theme"
			asChild={(tip) => (
				<button
					{...(tip() as object)}
					type="button"
					class={styles.switch}
					onClick={toggle}
					aria-label={
						isDark()
							? "Switch to light theme"
							: "Switch to dark theme"
					}
				>
					<Show
						when={isDark()}
						keyed
						fallback={
							<span class={iconClass()}>
								<Icon>{ICONS.lightMode}</Icon>
							</span>
						}
					>
						<span class={iconClass()}>
							<Icon>{ICONS.darkMode}</Icon>
						</span>
					</Show>
				</button>
			)}
		/>
	);
}
