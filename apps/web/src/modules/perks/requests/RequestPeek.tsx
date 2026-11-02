import type { JSX } from "solid-js";

import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import type { PeekProps } from "../../../shared/entity/entityDescriptor.ts";

import { RequestSheet } from "./RequestSheet.tsx";

/** The request sheet over any page but its own tab: a perk's Requests
 *  section, the bell or the palette away from the Requests tab. */
export function RequestPeek(props: PeekProps<PerkRequestRow>): JSX.Element {
	return (
		<RequestSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			request={props.row}
			loading={props.loading}
		/>
	);
}
