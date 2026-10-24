import { ErrorBoundary, type ErrorBoundaryProps } from "@j-os/design-system";
import type { JSX, ParentProps } from "solid-js";

import { checkForUpdateNow } from "../lib/pwaUpdates.ts";

/** The design-system boundary, plus a check for a new build on every caught
 * error: the usual cause after a deploy is a stale bundle. A `resetKey`
 * change (the route path, for a boundary that outlives navigation) clears a
 * caught error. */
export function AppErrorBoundary(
	props: ParentProps & Pick<ErrorBoundaryProps, "resetKey">
): JSX.Element {
	return (
		<ErrorBoundary onError={checkForUpdateNow} resetKey={props.resetKey}>
			{props.children}
		</ErrorBoundary>
	);
}
