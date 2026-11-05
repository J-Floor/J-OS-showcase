import type { Doc } from "../../../convex/_generated/dataModel";
import { RowActions } from "../../shared/actions/RowActions.tsx";
import { EntityQrActions } from "../../shared/entity/EntityQr.tsx";

import { eventsEntity } from "./entity.ts";

/**
 * Trailing per-row actions for the events table: copy the visitor link and
 * download the visitor QR — the same quick affordances the community roster
 * gives its rows. The column is added only for board/admin
 * (`manage`/`Events`). It sets `disableRowClick`, so these never open the
 * detail sheet.
 */
export function EventRowActions(props: { row: Doc<"events"> }) {
	return (
		<RowActions>
			<EntityQrActions {...eventsEntity.qr!(props.row)} />
		</RowActions>
	);
}
