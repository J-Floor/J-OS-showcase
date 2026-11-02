import { type JSX, Show, onMount } from "solid-js";

import { useTheme } from "../../JFloorProvider.tsx";
import {
	themePreferenceIcon,
	themeSwitchLabel,
} from "../../themePreference.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./ThemeSwitch.module.scss";

/**
 * Theme control: each press moves the preference to the next of System, Light
 * and Dark. The glyph shows the current preference, the label what a press
 * does next. The glyph is derived straight from the preference so it is always
 * correct, including the very first render (ark's `Swap` didn't honour its
 * initial state on mount). Reads/drives the preference via {@link useTheme}.
 */
export function ThemeSwitch(): JSX.Element {
	const { preference, cycle } = useTheme();
	function label() {
		return themeSwitchLabel(preference());
	}
	// The keyed <Show> re-creates the glyph span on every change (→ rotate-in)
	// AND on every mount. Animate only AFTER the initial mount, so re-mounting
	// the switch (e.g. on navigation) doesn't replay the intro — only a real
	// press does. `isMounted` is read at span-creation time, no reactivity needed.
	let isMounted = false;
	onMount(() => {
		isMounted = true;
	});
	return (
		<Tooltip
			tooltipContent={label()}
			asChild={(tip) => (
				<button
					{...tip()}
					type="button"
					class={styles.switch}
					onClick={cycle}
					aria-label={label()}
				>
					<Show when={preference()} keyed>
						{(current) => (
							<span
								class={styles.icon}
								data-animated={isMounted ? "" : undefined}
							>
								<Icon>{themePreferenceIcon(current)}</Icon>
							</span>
						)}
					</Show>
				</button>
			)}
		/>
	);
}
