import type { JSX } from "solid-js";

import { RowActions } from "../../../shared/actions/RowActions.tsx";
import { EntityQrActions } from "../../../shared/entity/EntityQr.tsx";
import type { Item } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";

/**
 * Trailing per-row actions for the items table: copy the item's deep-link and
 * download its QR — mirrors `EventRowActions`. The column is only added for
 * whoever can manage inventory; it sets `disableRowClick`, so these never
 * open the item sheet.
 */
export function InventoryRowActions(props: { row: Item }): JSX.Element {
	return (
		<RowActions>
			<EntityQrActions {...itemEntity.qr!(props.row)} />
		</RowActions>
	);
}
