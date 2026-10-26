import type { JSX } from "solid-js";

import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import type { Category } from "./data/inventoryData.ts";
import { CategorySheet } from "./sheets/CategorySheet.tsx";

/** The category sheet over any page. */
export function CategoryPeek(props: PeekProps<Category>): JSX.Element {
	return (
		<CategorySheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			category={props.row}
			loading={props.loading}
		/>
	);
}
