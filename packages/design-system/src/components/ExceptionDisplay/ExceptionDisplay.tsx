import { type JSX, Show } from "solid-js";

import { Icon } from "../Icon/Icon.tsx";
import { Status, type TStatus } from "../Status/Status.tsx";

import styles from "./ExceptionDisplay.module.scss";

export type ExceptionDisplayProps = {
	/** Drives the icon + text colour via the `<Status>` wrapper. */
	status?: TStatus;
	/** Material Symbols ligature. */
	icon: string;
	/** Heading. */
	title: string;
	/** Optional detail/body. */
	description?: JSX.Element;
	/** Optional actions row (e.g. Buttons). */
	children?: JSX.Element;
};

/**
 * Centered "something is off" screen shell — a big status-coloured icon, a title,
 * an optional description, and an optional actions row. The base for
 * `ErrorBoundary` / `EmptyState` / `PermissionDenied` (internal, like BaseButton).
 *
 * Ported from EmboUI's ErrorBoundary layout. The big icon is sized in SCSS via
 * `.message [data-icon] { font-size }` — sizing the glyph by font-size only,
 * never touching `font-family` (which would break the Material Symbols glyph).
 */
export function ExceptionDisplay(props: ExceptionDisplayProps): JSX.Element {
	return (
		<div class={styles.exceptionDisplay}>
			<Status status={props.status ?? "neutral"}>
				<div class={styles.message}>
					<Icon>{props.icon}</Icon>
					<h3 class={styles.title}>{props.title}</h3>
					<Show when={props.description}>
						<div class={styles.description}>
							{props.description}
						</div>
					</Show>
				</div>
			</Status>
			<Show when={props.children}>
				<div class={styles.actions}>{props.children}</div>
			</Show>
		</div>
	);
}
