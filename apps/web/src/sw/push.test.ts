import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { APP_NAME } from "../lib/constants.ts";

import { registerPushHandlers } from "./push.ts";

const ORIGIN = "https://app.example";

type Handler = (event: unknown) => void;

const handlers = new Map<string, Handler>();
const showNotification = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve()
);
const matchAll = vi.fn(() => Promise.resolve([] as unknown[]));
const openWindow = vi.fn<(...args: unknown[]) => Promise<null>>(() =>
	Promise.resolve(null)
);

beforeEach(() => {
	handlers.clear();
	showNotification.mockClear();
	matchAll.mockReset().mockResolvedValue([]);
	openWindow.mockClear();
	const fakeSelf = {
		addEventListener: (type: string, handler: Handler) => {
			handlers.set(type, handler);
		},
		registration: { showNotification },
		clients: { matchAll, openWindow },
		location: { origin: ORIGIN },
	};
	vi.stubGlobal("self", fakeSelf);
	registerPushHandlers();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function waitUntilOf(): {
	event: Record<string, unknown>;
	done: () => Promise<unknown>;
} {
	let pending: Promise<unknown> = Promise.resolve();
	const event: Record<string, unknown> = {
		waitUntil: (promise: Promise<unknown>) => {
			pending = promise;
		},
	};
	return { event, done: () => pending };
}

async function push(data: unknown): Promise<unknown[]> {
	const { event, done } = waitUntilOf();
	event.data = data;
	handlers.get("push")?.(event);
	await done();
	return showNotification.mock.calls[0] ?? [];
}

function payload(text: string) {
	return { text: () => text };
}

describe("push handler", () => {
	test("shows a default notification for an empty payload", async () => {
		const [title, options] = await push(null);
		expect(title).toBe(APP_NAME);
		expect(options).toMatchObject({ body: "", data: { url: "/" } });
	});

	test("falls back to the raw text for malformed JSON", async () => {
		const [title, options] = await push(payload("hello"));
		expect(title).toBe(APP_NAME);
		expect(options).toMatchObject({ body: "hello" });
	});

	test("still shows a notification for a null JSON payload", async () => {
		const [title, options] = await push(payload("null"));
		expect(title).toBe(APP_NAME);
		expect(options).toMatchObject({ body: "" });
	});

	test("renders a valid payload", async () => {
		const [title, options] = await push(
			payload(
				JSON.stringify({
					title: "Hi",
					body: "B",
					url: "/tasks",
					tag: "t1",
				})
			)
		);
		expect(title).toBe("Hi");
		expect(options).toMatchObject({
			body: "B",
			tag: "t1",
			data: { url: "/tasks" },
		});
	});
});

async function click(url: unknown) {
	const { event, done } = waitUntilOf();
	event.notification = { close: vi.fn(), data: { url } };
	handlers.get("notificationclick")?.(event);
	await done();
}

describe("notificationclick handler", () => {
	test("opens a same-origin target", async () => {
		await click("/tasks?x=1");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks?x=1`);
	});

	test("falls back to the root for a cross-origin url", async () => {
		await click("https://evil.example/phish");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
	});

	test("falls back to the root for an unparseable url", async () => {
		await click("https://[bad");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
	});

	test("focuses and navigates an open app window", async () => {
		const client = {
			url: `${ORIGIN}/home`,
			focus: vi.fn(() => Promise.resolve()),
			navigate: vi.fn<(...args: unknown[]) => Promise<void>>(() =>
				Promise.resolve()
			),
		};
		matchAll.mockResolvedValue([client]);
		await click("/tasks");
		expect(client.focus).toHaveBeenCalled();
		expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/tasks`);
		expect(openWindow).not.toHaveBeenCalled();
	});

	test("opens a new window when focusing fails", async () => {
		matchAll.mockResolvedValue([
			{
				url: `${ORIGIN}/home`,
				focus: () => Promise.reject(new Error("nope")),
			},
		]);
		await click("/tasks");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks`);
	});
});
