import type { JSX } from "solid-js";

import type { PerkRow } from "../../../convex/perks.ts";
import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import { PerkSheet } from "./PerkSheet.tsx";

/** The perk sheet over any page: a palette pick, the bell's link to a
 *  request, a row of the board's requests. */
export function PerkPeek(props: PeekProps<PerkRow>): JSX.Element {
	return (
		<PerkSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			perk={props.row}
			loading={props.loading}
		/>
	);
}
