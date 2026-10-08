import { Icon, Tooltip } from "@j-os/design-system";
import { Show } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import styles from "./VentureLink.module.scss";

/**
 * One venture link as the board sees it. A link Safe Browsing flagged is shown
 * as plain text with a warning, never as something to click.
 */
export function VentureLink(props: {
	link: { label: string; url: string; threat?: string };
	class?: string;
}) {
	return (
		<Show
			when={props.link.threat}
			fallback={
				<a
					class={props.class}
					href={props.link.url}
					target="_blank"
					rel="noreferrer"
				>
					{props.link.label || props.link.url}
				</a>
			}
		>
			{(threat) => (
				<span class={styles.flagged}>
					{props.link.label || props.link.url}
					<Tooltip
						tooltipContent={`Flagged by Safe Browsing: ${threat()}`}
						asChild={(triggerProps) => (
							<span
								{...triggerProps()}
								tabIndex={0}
								class={styles.warning}
							/>
						)}
					>
						<Icon>{ICONS.warning}</Icon>
					</Tooltip>
				</span>
			)}
		</Show>
	);
}
