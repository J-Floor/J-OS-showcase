import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const {
	calls,
	disablePush,
	signOut,
	navigate,
	endDataSession,
	setKeeperActive,
	sessionUser,
} = vi.hoisted(() => {
	const calls: string[] = [];
	const sessionUser: { current: { id: string } | null } = {
		current: { id: "u1" },
	};
	return {
		calls,
		sessionUser,
		disablePush: vi.fn(() => {
			calls.push("disablePush");
			return Promise.resolve();
		}),
		signOut: vi.fn(() => {
			calls.push("signOut");
			return Promise.resolve();
		}),
		navigate: vi.fn(),
		endDataSession: vi.fn(() => {
			calls.push("endDataSession");
		}),
		setKeeperActive: vi.fn((active: boolean) => {
			calls.push(`setKeeperActive(${String(active)})`);
		}),
	};
});
vi.mock("../lib/push.ts", () => ({ disablePush }));
vi.mock("../lib/auth.ts", () => ({
	authClient: {
		signOut,
		useSession: () => () => ({
			data: sessionUser.current ? { user: sessionUser.current } : null,
		}),
	},
}));
vi.mock("./data/caches.ts", () => ({ endDataSession }));
vi.mock("./data/queryKeeper.ts", () => ({ setKeeperActive }));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import { useSignOut } from "./useSignOut.ts";

afterEach(() => {
	calls.length = 0;
	sessionUser.current = { id: "u1" };
	vi.clearAllMocks();
});

function hook(): () => Promise<void> {
	return createRoot(() => useSignOut());
}

test("removes this device's push subscription and ends the data session before signing out", async () => {
	await hook()();
	expect(calls).toEqual(["disablePush", "endDataSession", "signOut"]);
	expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
});

test("still signs out when removing the subscription fails", async () => {
	disablePush.mockImplementationOnce(() =>
		Promise.reject(new Error("offline"))
	);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	await hook()();
	expect(signOut).toHaveBeenCalledOnce();
});

test("signs out even when removing the subscription never settles", async () => {
	// Stands in for disablePush's own timeout: it rejects once that elapses.
	disablePush.mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				setTimeout(() => {
					reject(new Error("The server did not confirm in time."));
				}, 4_000);
			})
	);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.useFakeTimers();
	try {
		const done = hook()();
		expect(signOut).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(4_000);
		await done;
		expect(signOut).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
	} finally {
		vi.useRealTimers();
	}
});

test("a failed sign-out with the user still signed in switches the keeper back on", async () => {
	signOut.mockImplementationOnce(() => Promise.reject(new Error("offline")));
	await expect(hook()()).rejects.toThrow("offline");
	expect(calls).toEqual([
		"disablePush",
		"endDataSession",
		"setKeeperActive(true)",
	]);
	expect(navigate).not.toHaveBeenCalled();
});

test("a failed sign-out with no user left keeps the keeper off", async () => {
	sessionUser.current = null;
	signOut.mockImplementationOnce(() => Promise.reject(new Error("offline")));
	await expect(hook()()).rejects.toThrow("offline");
	expect(setKeeperActive).not.toHaveBeenCalled();
	expect(navigate).not.toHaveBeenCalled();
});
