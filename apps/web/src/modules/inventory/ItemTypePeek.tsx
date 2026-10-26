import type { JSX } from "solid-js";

import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import type { ItemType } from "./data/inventoryData.ts";
import { ItemTypeSheet } from "./sheets/ItemTypeSheet.tsx";

/** The item type sheet over any page. */
export function ItemTypePeek(props: PeekProps<ItemType>): JSX.Element {
	return (
		<ItemTypeSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			itemType={props.row}
			loading={props.loading}
		/>
	);
}
