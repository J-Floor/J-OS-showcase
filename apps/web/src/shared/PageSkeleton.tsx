import { TableSkeleton } from "@j-os/design-system";
import type { JSX } from "solid-js";

/** Shown while a module page's chunk loads: the table-shaped placeholder every
 *  module page opens on, so the swap to the real page does not jump. */
export function PageSkeleton(): JSX.Element {
	return <TableSkeleton />;
}
