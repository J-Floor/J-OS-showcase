import { type JSX } from "solid-js";

import { ExceptionDisplay } from "../ExceptionDisplay/ExceptionDisplay.tsx";
import { type TStatus } from "../Status/Status.tsx";

export type PermissionDeniedProps = {
	/** Status colour. Default "warning". */
	status?: TStatus;
	/** Material Symbols ligature. Default "lock". */
	icon?: string;
	/** Heading. Default "You don't have access". */
	title?: string;
	/** Optional detail/body. Default explains the restriction. */
	description?: JSX.Element;
	/** Optional actions (e.g. a sign-in link). */
	children?: JSX.Element;
};

/** Generic "you don't have access" placeholder built on {@link ExceptionDisplay}. */
export function PermissionDenied(props: PermissionDeniedProps): JSX.Element {
	return (
		<ExceptionDisplay
			status={props.status ?? "neutral"}
			icon={props.icon ?? "lock"}
			title={props.title ?? "You don't have access"}
			description={
				props.description ?? "You don't have permission to view this."
			}
		>
			{props.children}
		</ExceptionDisplay>
	);
}
