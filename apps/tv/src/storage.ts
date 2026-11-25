const TOKEN_KEY = "jfloor-tv-token";
const SCHEDULE_KEY = "jfloor-tv-schedule";

/** The device token and the cached power schedule live only here; storage can be unavailable, so every call is guarded. */
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
	getSchedule(): string | null {
		try {
			return localStorage.getItem(SCHEDULE_KEY);
		} catch {
			return null;
		}
	},
	setSchedule(xml: string): void {
		try {
			localStorage.setItem(SCHEDULE_KEY, xml);
		} catch {
			// Unavailable storage: the schedule is fetched again on the next sync.
		}
	},
	clearSchedule(): void {
		try {
			localStorage.removeItem(SCHEDULE_KEY);
		} catch {
			// Nothing to clear.
		}
	},
};
