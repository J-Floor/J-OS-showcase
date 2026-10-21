// @vitest-environment happy-dom
import type { Result } from "neverthrow";
import { afterEach, describe, expect, test, vi } from "vitest";

const { mutation } = vi.hoisted(() => ({
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed args let toHaveBeenCalledWith see the call shape
	mutation: vi.fn((..._args: unknown[]) => Promise.resolve(null)),
}));
vi.mock("./convex.ts", () => ({ convex: { mutation } }));
vi.mock("../../convex/_generated/api", () => ({
	api: {
		notify: {
			subscriptions: {
				subscribe: "subscribe",
				unsubscribe: "unsubscribe",
			},
		},
	},
}));

import type { ClientError } from "./call.ts";
import {
	base64UrlToBytes,
	disablePush,
	enablePush,
	pushSubscribed,
	pushSupport,
	resyncPush,
} from "./push.ts";

async function valueOf<T>(
	pending: PromiseLike<Result<T, ClientError>>
): Promise<T> {
	const result = await pending;
	return result._unsafeUnwrap();
}

async function errorOf<T>(
	pending: PromiseLike<Result<T, ClientError>>
): Promise<ClientError> {
	const result = await pending;
	return result._unsafeUnwrapErr();
}

const DESKTOP_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function setNavigator(key: string, value: unknown): void {
	Object.defineProperty(navigator, key, { configurable: true, value });
}

function fakeSubscription(key: number[] = [1, 2, 3]) {
	return {
		endpoint: "https://push.example/abc",
		options: { applicationServerKey: new Uint8Array(key).buffer },
		toJSON: () => ({
			endpoint: "https://push.example/abc",
			keys: { p256dh: "p256", auth: "auth" },
		}),
		unsubscribe: vi.fn(() => Promise.resolve(true)),
	};
}

function installPush(options: {
	permission: NotificationPermission;
	request?: NotificationPermission;
	existing?: ReturnType<typeof fakeSubscription> | null;
}) {
	const created = fakeSubscription();
	const pushManager = {
		getSubscription: vi.fn(() => Promise.resolve(options.existing ?? null)),
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed args let toHaveBeenCalledWith see the call shape
		subscribe: vi.fn((..._args: unknown[]) => Promise.resolve(created)),
	};
	const registration = { pushManager };
	setNavigator("userAgent", DESKTOP_UA);
	setNavigator("serviceWorker", {
		ready: Promise.resolve(registration),
		getRegistration: vi.fn(() => Promise.resolve(registration)),
	});
	// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- stand-in for the PushManager global, only its presence matters
	vi.stubGlobal("PushManager", class {});
	vi.stubGlobal("Notification", {
		permission: options.permission,
		requestPermission: vi.fn(() =>
			Promise.resolve(options.request ?? options.permission)
		),
	});
	return { pushManager, created };
}

afterEach(() => {
	Reflect.deleteProperty(navigator, "serviceWorker");
	Reflect.deleteProperty(navigator, "userAgent");
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	mutation.mockClear();
});

describe("pushSupport", () => {
	test("unsupported without a service worker or PushManager", () => {
		setNavigator("userAgent", DESKTOP_UA);
		expect(pushSupport()).toBe("unsupported");
	});

	test("ios on iPhone Safari outside the home-screen app", () => {
		installPush({ permission: "default" });
		setNavigator("userAgent", IPHONE_UA);
		expect(pushSupport()).toBe("ios");
	});

	test.each(["default", "denied", "granted"] as const)(
		"reports the %s permission when push is supported",
		(permission) => {
			installPush({ permission });
			expect(pushSupport()).toBe(permission);
		}
	);
});

describe("enablePush", () => {
	test("asks, subscribes with the VAPID key, and registers the device", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const { pushManager } = installPush({
			permission: "default",
			request: "granted",
		});
		expect(await valueOf(enablePush())).toBe("granted");
		expect(pushManager.subscribe).toHaveBeenCalledWith({
			userVisibleOnly: true,
			applicationServerKey: new Uint8Array([1, 2, 3]),
		});
		expect(mutation).toHaveBeenCalledWith("subscribe", {
			endpoint: "https://push.example/abc",
			p256dh: "p256",
			auth: "auth",
			userAgent: DESKTOP_UA,
		});
	});

	test("stops when the person refuses permission", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const { pushManager } = installPush({
			permission: "default",
			request: "denied",
		});
		expect(await valueOf(enablePush())).toBe("denied");
		expect(pushManager.subscribe).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	});

	test("refuses to run without a VAPID key", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
		installPush({ permission: "default" });
		const error = await errorOf(enablePush());
		expect(error.code).toBe("PushNotConfigured");
	});
});

describe("VAPID key rotation", () => {
	test("enablePush replaces a subscription made for another key", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const existing = fakeSubscription([9, 9, 9]);
		const { pushManager } = installPush({
			permission: "default",
			request: "granted",
			existing,
		});
		await enablePush();
		expect(existing.unsubscribe).toHaveBeenCalledOnce();
		expect(pushManager.subscribe).toHaveBeenCalledOnce();
	});

	test("enablePush reuses a subscription for the current key", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const existing = fakeSubscription([1, 2, 3]);
		const { pushManager } = installPush({
			permission: "default",
			request: "granted",
			existing,
		});
		await enablePush();
		expect(existing.unsubscribe).not.toHaveBeenCalled();
		expect(pushManager.subscribe).not.toHaveBeenCalled();
	});

	test("resyncPush re-subscribes when the key changed, without prompting", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const existing = fakeSubscription([9, 9, 9]);
		const { pushManager } = installPush({
			permission: "granted",
			existing,
		});
		await resyncPush();
		expect(existing.unsubscribe).toHaveBeenCalledOnce();
		expect(pushManager.subscribe).toHaveBeenCalledOnce();
		// eslint-disable-next-line @typescript-eslint/unbound-method -- the stubbed Notification global is a vi.fn spy
		expect(Notification.requestPermission).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledWith("subscribe", expect.anything());
	});
});

describe("disablePush, resyncPush, pushSubscribed", () => {
	test("disablePush forgets the device on the server, then unsubscribes the browser", async () => {
		const existing = fakeSubscription();
		installPush({ permission: "granted", existing });
		await disablePush();
		expect(mutation).toHaveBeenCalledWith("unsubscribe", {
			endpoint: existing.endpoint,
		});
		expect(existing.unsubscribe).toHaveBeenCalledOnce();
	});

	test("disablePush still drops the browser subscription when the server call fails", async () => {
		const existing = fakeSubscription();
		installPush({ permission: "granted", existing });
		mutation.mockRejectedValueOnce(new Error("offline"));
		const error = await errorOf(disablePush());
		expect(error.code).toBe("Unknown");
		expect(existing.unsubscribe).toHaveBeenCalledOnce();
	});

	test("disablePush gives up on a server call that never settles, still dropping the browser subscription", async () => {
		vi.useFakeTimers();
		try {
			const existing = fakeSubscription();
			installPush({ permission: "granted", existing });
			mutation.mockImplementationOnce(() => new Promise(() => {}));
			const result = disablePush();
			await vi.advanceTimersByTimeAsync(4_000);
			const error = await errorOf(result);
			expect(error.code).toBe("ServerTimeout");
			expect(existing.unsubscribe).toHaveBeenCalledOnce();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	test("enablePush rejects a subscription without keys", async () => {
		vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
		const base = fakeSubscription();
		const existing = base;
		const noKeys = {
			...existing,
			toJSON: () => ({
				endpoint: existing.endpoint,
				keys: { p256dh: "", auth: "" },
			}),
		};
		installPush({
			permission: "default",
			request: "granted",
			existing: noKeys,
		});
		const error = await errorOf(enablePush());
		expect(error.code).toBe("PushSubscriptionMissingKeys");
		expect(mutation).not.toHaveBeenCalled();
	});

	test("a failure reading the subscription on the way off says turning off failed", async () => {
		installPush({ permission: "granted", existing: null });
		setNavigator("serviceWorker", {
			ready: Promise.resolve({}),
			getRegistration: vi.fn(() => Promise.reject(new Error("no"))),
		});
		const error = await errorOf(disablePush());
		expect(error.message).toBe("Could not turn off notifications.");
	});

	test("disablePush does nothing without a subscription", async () => {
		installPush({ permission: "granted", existing: null });
		await disablePush();
		expect(mutation).not.toHaveBeenCalled();
	});

	test("resyncPush re-registers the current subscription once permission is granted", async () => {
		installPush({ permission: "granted", existing: fakeSubscription() });
		await resyncPush();
		expect(mutation).toHaveBeenCalledWith(
			"subscribe",
			expect.objectContaining({ endpoint: "https://push.example/abc" })
		);
	});

	test("resyncPush does nothing before permission is granted", async () => {
		installPush({ permission: "default", existing: fakeSubscription() });
		await resyncPush();
		expect(mutation).not.toHaveBeenCalled();
	});

	test("pushSubscribed reflects the browser subscription", async () => {
		installPush({ permission: "granted", existing: fakeSubscription() });
		expect(await valueOf(pushSubscribed())).toBe(true);
	});
});

test("base64UrlToBytes decodes url-safe base64 without padding", () => {
	expect([...base64UrlToBytes("AQID")]).toEqual([1, 2, 3]);
	expect([...base64UrlToBytes("-_8")]).toEqual([251, 255]);
});
