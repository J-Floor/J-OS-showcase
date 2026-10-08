import { ErrorBoundary } from "@j-os/design-system";
import type { JSX, ParentProps } from "solid-js";

import { checkForUpdateNow } from "../lib/pwaUpdates.ts";

/** The design-system boundary, plus a check for a new build on every caught
 * error: the usual cause after a deploy is a stale bundle. */
export function AppErrorBoundary(props: ParentProps): JSX.Element {
	return (
		<ErrorBoundary onError={checkForUpdateNow}>
			{props.children}
		</ErrorBoundary>
	);
}
