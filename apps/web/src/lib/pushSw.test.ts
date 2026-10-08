import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { beforeEach, describe, expect, test, vi } from "vitest";

const ORIGIN = "https://app.example";
const SCRIPT = readFileSync(
	resolve(import.meta.dirname, "../../public/push-sw.js"),
	"utf8"
);

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
	runInNewContext(SCRIPT, { self: fakeSelf, URL, String });
});

function waitUntilOf(): {
	event: Record<string, unknown>;
	done: () => Promise<unknown>;
} {
	let pending: Promise<unknown> = Promise.resolve();
	const event: Record<string, unknown> = {
		waitUntil: (p: Promise<unknown>) => {
			pending = p;
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

function payload(json: () => unknown, text = () => "") {
	return { json, text };
}

describe("push handler", () => {
	test("shows a default notification for an empty payload", async () => {
		const [title, options] = await push(null);
		expect(title).toBe("J floor");
		expect(options).toMatchObject({ body: "", data: { url: "/" } });
	});

	test("falls back to the raw text for malformed JSON", async () => {
		const [title, options] = await push(
			payload(
				() => {
					throw new SyntaxError("bad");
				},
				() => "hello"
			)
		);
		expect(title).toBe("J floor");
		expect(options).toMatchObject({ body: "hello" });
	});

	test("still shows a notification for a null JSON payload", async () => {
		const [title, options] = await push(payload(() => null));
		expect(title).toBe("J floor");
		expect(options).toMatchObject({ body: "" });
	});

	test("renders a valid payload", async () => {
		const [title, options] = await push(
			payload(() => ({
				title: "Hi",
				body: "B",
				url: "/tasks",
				tag: "t1",
			}))
		);
		expect(title).toBe("Hi");
		expect(options).toMatchObject({
			body: "B",
			tag: "t1",
			data: { url: "/tasks" },
		});
	});
});

describe("notificationclick handler", () => {
	async function click(url: unknown) {
		const { event, done } = waitUntilOf();
		event.notification = { close: vi.fn(), data: { url } };
		handlers.get("notificationclick")?.(event);
		await done();
	}

	test("opens a same-origin target", async () => {
		await click("/tasks?x=1");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks?x=1`);
	});

	test("falls back to the root for a cross-origin url", async () => {
		await click("https://evil.example/phish");
		expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
	});

	test("falls back to the root for an unparseable url", async () => {
		await click("http://[bad");
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
