export type DoorError =
	| { type: "DoorNotConfigured" }
	| { type: "NotOnBuildingNetwork" }
	| { type: "DoorNotAvailable" }
	| { type: "DoorLocksItself" }
	| { type: "DoorPositionNotShown" }
	| { type: "DoorPositionNotAvailable" }
	| { type: "DoorProviderNotConfigured"; detail: string }
	| { type: "DoorWritesDisabled" }
	/** `detail` is for logs only; the client message never includes it.
	 *  `status` is the HTTP status when the provider answered with one. */
	| { type: "DoorProviderFailed"; detail: string; status?: number };

export const doorMessages: Record<DoorError["type"], string> = {
	DoorNotConfigured: "Door control is not configured.",
	NotOnBuildingNetwork:
		"You need to be on the J floor Wi-Fi to use the door.",
	DoorNotAvailable: "Door access is not available for your account.",
	DoorLocksItself: "This door locks by itself.",
	DoorPositionNotShown: "This door's position is not shown.",
	DoorPositionNotAvailable:
		"Door position is not available for your account.",
	DoorProviderNotConfigured: "The door provider is not configured.",
	DoorWritesDisabled:
		"Door writes are disabled on this deployment, so nothing was sent to the lock.",
	DoorProviderFailed: "The door provider could not complete the request.",
};

/** What a door error says in a log line: the raw provider text when there is
 *  one, otherwise the user-facing sentence. Never shown to a client. */
export function doorErrorDetail(error: DoorError): string {
	return error.type === "DoorProviderFailed" ||
		error.type === "DoorProviderNotConfigured"
		? error.detail
		: doorMessages[error.type];
}
