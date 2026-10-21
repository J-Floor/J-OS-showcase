import { err, ok, type Result } from "neverthrow";
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
	toasterCreate,
} = vi.hoisted(() => {
	const calls: string[] = [];
	const sessionUser: { current: { id: string } | null } = {
		current: { id: "u1" },
	};
	return {
		calls,
		sessionUser,
		toasterCreate: vi.fn(),
		disablePush: vi.fn((): Promise<Result<void, ClientError>> => {
			calls.push("disablePush");
			return Promise.resolve(ok());
		}),
		signOut: vi.fn(() => {
			calls.push("signOut");
			return Promise.resolve();
		}),
		navigate: vi.fn(),
		endDataSession: vi.fn(() => {
			calls.push("endDataSession");
		}),
		setKeeperActive: vi.fn((isActive: boolean) => {
			calls.push(`setKeeperActive(${String(isActive)})`);
		}),
	};
});
vi.mock("../lib/push.ts", () => ({ disablePush }));
vi.mock("./toaster.ts", () => ({ toaster: { create: toasterCreate } }));
function currentSession() {
	return {
		data: sessionUser.current ? { user: sessionUser.current } : null,
	};
}
vi.mock("../lib/auth.ts", () => ({
	authClient: { signOut, useSession: () => currentSession },
}));
vi.mock("./data/caches.ts", () => ({ endDataSession }));
vi.mock("./data/queryKeeper.ts", () => ({ setKeeperActive }));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import type { ClientError } from "../lib/call.ts";

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
		Promise.resolve(err({ code: "Unknown", message: "offline" }))
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
	await hook()();
	expect(signOut).toHaveBeenCalledOnce();
});

test("signs out even when removing the subscription never settles", async () => {
	// Stands in for disablePush's own timeout: it fails once that elapses.
	disablePush.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				setTimeout(() => {
					resolve(
						err({
							code: "ServerTimeout",
							message: "The server did not confirm in time.",
						})
					);
				}, 4_000);
			})
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
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

test("a failed sign-out with the user still signed in switches the keeper back on and toasts", async () => {
	signOut.mockImplementationOnce(() => Promise.reject(new Error("offline")));
	await hook()();
	expect(calls).toEqual([
		"disablePush",
		"endDataSession",
		"setKeeperActive(true)",
	]);
	expect(toasterCreate).toHaveBeenCalledWith(
		expect.objectContaining({ type: "error" })
	);
	expect(navigate).not.toHaveBeenCalled();
});

test("a failed sign-out with no user left keeps the keeper off", async () => {
	sessionUser.current = null;
	signOut.mockImplementationOnce(() => Promise.reject(new Error("offline")));
	await hook()();
	expect(setKeeperActive).not.toHaveBeenCalled();
	expect(toasterCreate).toHaveBeenCalledOnce();
	expect(navigate).not.toHaveBeenCalled();
});
