import clsx from "clsx";
import { splitProps, type JSX } from "solid-js";

import { Status, type TStatus } from "../Status/Status.tsx";

import styles from "./Badge.module.scss";

export type BadgeProps = Omit<
	JSX.HTMLAttributes<HTMLSpanElement>,
	"children"
> & {
	/** Status colour. Default "neutral". */
	status?: TStatus;
	children: JSX.Element;
};

/**
 * Compact status pill. `Status` maps the status to `--jf-status-bg`/`-fg`; the
 * pill reads those vars and never branches on the status value itself.
 */
export function Badge(props: BadgeProps): JSX.Element {
	const [local, rest] = splitProps(props, ["status", "class", "children"]);
	return (
		<Status status={local.status ?? "neutral"}>
			<span {...rest} class={clsx(styles.badge, local.class)}>
				{local.children}
			</span>
		</Status>
	);
}
