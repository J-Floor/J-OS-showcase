import type { JSX } from "solid-js";

import { Can } from "../../../lib/ability.tsx";
import { EntityQrActions } from "../../../shared/entity/EntityQr.tsx";
import { RowActions } from "../../community/columns/RowActions.tsx";
import type { Item } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";

/**
 * Trailing per-row actions for the items table: copy the item's deep-link and
 * download its QR — mirrors `EventRowActions`. Board/admin only
 * (`manage`/`Inventory`); the column sets `disableRowClick`, so these never
 * open the item drawer.
 */
export function InventoryRowActions(props: { row: Item }): JSX.Element {
	return (
		<Can I="manage" the="Inventory">
			<RowActions>
				<EntityQrActions {...itemEntity.qr!(props.row)} />
			</RowActions>
		</Can>
	);
}
