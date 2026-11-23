const TOKEN_KEY = "jfloor-tv-token";

/** The device token lives only here; storage can be unavailable, so every call is guarded. */
export const storage = {
	getToken(): string | null {
		try {
			return localStorage.getItem(TOKEN_KEY);
		} catch {
			return null;
		}
	},
	setToken(token: string): void {
		try {
			localStorage.setItem(TOKEN_KEY, token);
		} catch {
			// Unavailable storage: the TV pairs again after a restart.
		}
	},
	clearToken(): void {
		try {
			localStorage.removeItem(TOKEN_KEY);
		} catch {
			// Nothing to clear.
		}
	},
};
