import { useMutation } from "convex-solidjs";
import { createMemo, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PerkRequestStatus } from "../../../convex/lib/perks.ts";
import { call } from "../../lib/call.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { InlineError } from "../../shared/InlineError.tsx";

import { EnumSelect } from "./EnumSelect.tsx";
import { PERK_REQUEST_STATUS_OPTIONS } from "./perkOptions.ts";

/**
 * A request's status, which any board member or admin moves: requested,
 * contacted, then granted or declined. Saves as soon as another one is
 * picked. The picker shows the server's status, so a refused change leaves
 * it as it was and says why underneath.
 */
export function PerkRequestStatusSelect(props: {
	requestId: Id<"perkRequests">;
	status: PerkRequestStatus;
}): JSX.Element {
	const setPerkRequestStatus = useMutation(
		api.perkRequests.setPerkRequestStatus
	);
	// Keyed by the request, so a refusal only ever shows against the request
	// it was made for. The sheet mounts one picker per request, and the
	// Requests tab's virtualised table keeps each row by its request id; a
	// row scrolled out of its window unmounts its picker, refusal and all.
	// A memo of the id: a live update hands the picker a new row for the
	// same request, which must not clear its refusal.
	const requestId = createMemo(() => props.requestId);
	const { error, trackResult } = createActionError(() => requestId());
	function commit(status: PerkRequestStatus): void {
		void trackResult(
			call(
				setPerkRequestStatus.mutateAsync({
					requestId: props.requestId,
					status,
				}),
				"Could not change the status."
			)
		);
	}
	return (
		<>
			<EnumSelect
				label="Status"
				labelHidden
				options={PERK_REQUEST_STATUS_OPTIONS}
				value={props.status}
				onChange={commit}
			/>
			<InlineError message={error()} />
		</>
	);
}
