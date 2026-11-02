import type { JSX } from "solid-js";

import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import type { PeekProps } from "../../../shared/entity/entityDescriptor.ts";

import { RequestSheet } from "./RequestSheet.tsx";

/** The request sheet over any page: a Requests row, a perk's Requests
 *  section, the bell's link to a request. */
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
