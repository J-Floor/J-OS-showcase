import clsx from "clsx";
import type { JSX } from "solid-js";

import { Status, type TStatus } from "../Status/Status.tsx";

import styles from "./Badge.module.scss";

export type BadgeProps = {
	/** Status colour. Default "neutral". */
	status?: TStatus;
	children: JSX.Element;
	class?: string;
};

/**
 * Compact status pill. `Status` maps the status to `--jf-status-bg`/`-fg`; the
 * pill reads those vars and never branches on the status value itself.
 */
export function Badge(props: BadgeProps): JSX.Element {
	return (
		<Status status={props.status ?? "neutral"}>
			<span class={clsx(styles.badge, props.class)}>
				{props.children}
			</span>
		</Status>
	);
}
