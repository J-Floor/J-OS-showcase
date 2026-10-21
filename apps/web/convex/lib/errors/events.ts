export type EventsError =
	| { type: "EventTimesNotInSiteZone" }
	| { type: "EventStartAfterEnd" }
	| { type: "EventNameRequired" }
	| { type: "EventNotFound" }
	| { type: "EventEnded" };

export const eventsMessages: Record<EventsError["type"], string> = {
	EventTimesNotInSiteZone: "Event times must be in the J floor's time zone.",
	EventStartAfterEnd: "The start must be on or before the end.",
	EventNameRequired: "Event name is required.",
	EventNotFound: "Event not found.",
	EventEnded: "Event has ended.",
};
