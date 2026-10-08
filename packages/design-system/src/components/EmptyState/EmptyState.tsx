import { type JSX } from "solid-js";

import { ExceptionDisplay } from "../ExceptionDisplay/ExceptionDisplay.tsx";
import { type TStatus } from "../Status/Status.tsx";

export type EmptyStateProps = {
	/** Status colour. Default "neutral". */
	status?: TStatus;
	/** Material Symbols ligature. Default "inbox". */
	icon?: string;
	/** Heading. Default "Nothing here yet". */
	title?: string;
	/** Optional detail/body. */
	description?: JSX.Element;
	/** Optional actions (e.g. a "Create" Button). */
	children?: JSX.Element;
};

/** Generic "nothing here" placeholder built on {@link ExceptionDisplay}. */
export function EmptyState(props: EmptyStateProps): JSX.Element {
	return (
		<ExceptionDisplay
			status={props.status ?? "neutral"}
			icon={props.icon ?? "inbox"}
			title={props.title ?? "Nothing here yet"}
			description={props.description}
		>
			{props.children}
		</ExceptionDisplay>
	);
}
