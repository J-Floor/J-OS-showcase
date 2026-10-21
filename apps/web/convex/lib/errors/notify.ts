export type NotifyError =
	| { type: "InvalidPushEndpoint" }
	| { type: "NotificationNotFound" }
	| { type: "EmailRejected" };

export const notifyMessages: Record<NotifyError["type"], string> = {
	InvalidPushEndpoint: "That push endpoint is not valid.",
	NotificationNotFound: "That notification no longer exists.",
	EmailRejected: "The email could not be delivered.",
};
