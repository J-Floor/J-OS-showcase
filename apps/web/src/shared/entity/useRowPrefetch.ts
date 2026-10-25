import { useAbility } from "../../lib/ability.tsx";
import type { EntityRow } from "../types.ts";

import type { EntityDescriptor } from "./entityDescriptor.ts";

/**
 * Warms the descriptor's sheet queries for one row, with the viewer's
 * ability as its `canPerform`. Takes `undefined` (no row focused) and does nothing,
 * so it can be handed straight to a table's row hover and focus callbacks.
 */
export function useRowPrefetch<Row extends EntityRow>(
	descriptor: Pick<EntityDescriptor<Row>, "prefetch"> | undefined
): (row: Row | undefined) => void {
	const ability = useAbility();
	return (row) => {
		if (row)
			descriptor?.prefetch?.(row, (action, subject) =>
				ability().can(action, subject)
			);
	};
}
