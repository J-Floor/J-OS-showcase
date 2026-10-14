import { describe, expect, it, vi } from "vitest";

import source from "../../public/reload-sw.js?raw";

type FakeClient = { url: string; navigate: ReturnType<typeof vi.fn> };

function createFakeSelf(options: { active: boolean; clients: FakeClient[] }) {
	const claim = vi.fn().mockResolvedValue(undefined);
	const matchAll = vi.fn().mockResolvedValue(options.clients);
	const self = Object.assign(new EventTarget(), {
		registration: { active: options.active ? {} : null },
		clients: { claim, matchAll },
	});
	// eslint-disable-next-line sonarjs/code-eval, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- evaluating the worker script against a fake `self` is the point of this test
	new Function("self", source)(self);
	return { self, claim, matchAll };
}

async function runLifecycle(self: EventTarget): Promise<void> {
	self.dispatchEvent(new Event("install"));
	let pending: Promise<unknown> = Promise.resolve();
	const activate = Object.assign(new Event("activate"), {
		waitUntil(promise: Promise<unknown>) {
			pending = promise;
		},
	});
	self.dispatchEvent(activate);
	await pending;
}

function fakeClient(url: string): FakeClient {
	return { url, navigate: vi.fn().mockResolvedValue(undefined) };
}

describe("reload-sw.js", () => {
	it("navigates every window client to its own url after claiming them on an update", async () => {
		const first = fakeClient("https://app.test/community");
		const second = fakeClient("https://app.test/tasks?id=1");
		const { self, claim, matchAll } = createFakeSelf({
			active: true,
			clients: [first, second],
		});

		await runLifecycle(self);

		expect(matchAll).toHaveBeenCalledWith({ type: "window" });
		expect(claim.mock.invocationCallOrder[0]).toBeLessThan(
			matchAll.mock.invocationCallOrder[0]
		);
		expect(first.navigate).toHaveBeenCalledWith(
			"https://app.test/community"
		);
		expect(second.navigate).toHaveBeenCalledWith(
			"https://app.test/tasks?id=1"
		);
	});

	it("navigates nothing on a first install", async () => {
		const first = fakeClient("https://app.test/");
		const { self, claim, matchAll } = createFakeSelf({
			active: false,
			clients: [first],
		});

		await runLifecycle(self);

		expect(claim).not.toHaveBeenCalled();
		expect(matchAll).not.toHaveBeenCalled();
		expect(first.navigate).not.toHaveBeenCalled();
	});

	it("survives a browser that rejects navigate()", async () => {
		const first = fakeClient("https://app.test/");
		first.navigate.mockRejectedValue(new TypeError("not allowed"));
		const second = fakeClient("https://app.test/space");
		const { self } = createFakeSelf({
			active: true,
			clients: [first, second],
		});

		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			await expect(runLifecycle(self)).resolves.toBeUndefined();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
		expect(second.navigate).toHaveBeenCalled();
	});

	it("does not wait for navigations to settle, so activation cannot deadlock on them", async () => {
		const first = fakeClient("https://app.test/");
		first.navigate.mockReturnValue(new Promise(() => {}));
		const { self } = createFakeSelf({ active: true, clients: [first] });

		await expect(runLifecycle(self)).resolves.toBeUndefined();
		expect(first.navigate).toHaveBeenCalledWith("https://app.test/");
	});
});
