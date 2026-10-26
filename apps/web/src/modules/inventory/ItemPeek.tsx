import type { JSX } from "solid-js";

import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import type { Item } from "./data/inventoryData.ts";
import { ItemSheet } from "./sheets/ItemSheet.tsx";

/** The item sheet over any page. */
export function ItemPeek(props: PeekProps<Item>): JSX.Element {
	return (
		<ItemSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			item={props.row}
			loading={props.loading}
		/>
	);
}
