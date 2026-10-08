import type { JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./SearchInput.module.scss";

/**
 * The X that empties a search field. Shared by `SearchInput` and
 * `CommandPalette` so every search box clears the same way.
 *
 * The label sits on the button that actually renders, because the Tooltip's
 * `asChild` merge does not carry one written on a wrapper — the same reason
 * EmboUI's Combobox puts it there. Callers render it only once there is
 * something to clear: a permanent X on an empty field does nothing.
 */
export function ClearSearchButton(props: { onClear: () => void }): JSX.Element {
	return (
		<Tooltip
			tooltipContent="Clear search"
			asChild={(tipProps) => (
				<button
					{...(tipProps() as object)}
					type="button"
					aria-label="Clear search"
					class={styles.clear}
					onClick={() => {
						props.onClear();
					}}
				>
					<Icon>{ICONS.close}</Icon>
				</button>
			)}
		/>
	);
}
