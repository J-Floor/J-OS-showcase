import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import {
	ExceptionDisplay,
	type ExceptionDisplayProps,
} from "../ExceptionDisplay/ExceptionDisplay.tsx";

/** {@link ExceptionDisplayProps}, each optional. Defaults: `status` "neutral",
 *  `icon` `ICONS.empty`, `title` "Nothing here yet". */
export type EmptyStateProps = Partial<ExceptionDisplayProps>;

/** Generic "nothing here" placeholder built on {@link ExceptionDisplay}. */
export function EmptyState(props: EmptyStateProps): JSX.Element {
	return (
		<ExceptionDisplay
			status={props.status ?? "neutral"}
			icon={props.icon ?? ICONS.empty}
			title={props.title ?? "Nothing here yet"}
			description={props.description}
		>
			{props.children}
		</ExceptionDisplay>
	);
}
