import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import {
	ExceptionDisplay,
	type ExceptionDisplayProps,
} from "../ExceptionDisplay/ExceptionDisplay.tsx";

/** {@link ExceptionDisplayProps}, each optional. Defaults: `status` "neutral",
 *  `icon` `ICONS.locked`, `title` "You don't have access", and a `description`
 *  explaining the restriction. */
export type PermissionDeniedProps = Partial<ExceptionDisplayProps>;

/** Generic "you don't have access" placeholder built on {@link ExceptionDisplay}. */
export function PermissionDenied(props: PermissionDeniedProps): JSX.Element {
	return (
		<ExceptionDisplay
			status={props.status ?? "neutral"}
			icon={props.icon ?? ICONS.locked}
			title={props.title ?? "You don't have access"}
			description={
				props.description ?? "You don't have permission to view this."
			}
		>
			{props.children}
		</ExceptionDisplay>
	);
}
