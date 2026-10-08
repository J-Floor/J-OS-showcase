import type { Doc } from "../../../convex/_generated/dataModel";
import { Can } from "../../lib/ability.tsx";
import { EntityQrActions } from "../../shared/entity/EntityQr.tsx";
import { RowActions } from "../community/columns/RowActions.tsx";

import { eventsEntity } from "./entity.ts";

/**
 * Trailing per-row actions for the events table: copy the visitor link and
 * download the visitor QR — the same quick affordances the community roster
 * gives its rows. Board/admin only (`manage`/`Events`); a plain member's row
 * shows no actions. The column sets `disableRowClick`, so these never open the
 * detail drawer.
 */
export function EventRowActions(props: { row: Doc<"events"> }) {
	return (
		<Can I="manage" the="Events">
			<RowActions>
				<EntityQrActions {...eventsEntity.qr!(props.row)} />
			</RowActions>
		</Can>
	);
}
