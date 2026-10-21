export type OccupancyError =
	/** `detail` is for logs only; the client message never includes it.
	 *  `status` is the HTTP status when the provider answered with one. */
	| { type: "OccupancyProviderFailed"; detail: string; status?: number }
	/** A webhook body the adapter could not read. `detail` is for logs. */
	| { type: "OccupancyWebhookInvalid"; detail: string };

export const occupancyMessages: Record<OccupancyError["type"], string> = {
	OccupancyProviderFailed:
		"The occupancy provider could not complete the request.",
	OccupancyWebhookInvalid: "The occupancy update could not be read.",
};

/** What an occupancy error says in a log line. Never shown to a client. */
export function occupancyErrorDetail(error: OccupancyError): string {
	return error.detail;
}
