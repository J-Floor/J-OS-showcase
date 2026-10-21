export type AuthError =
	| { type: "NotAuthenticated" }
	| { type: "Forbidden" }
	| { type: "AccessExpired" };

export const authMessages: Record<AuthError["type"], string> = {
	NotAuthenticated: "Please sign in again.",
	Forbidden: "You can't do that.",
	AccessExpired: "Your access has expired or been revoked.",
};
