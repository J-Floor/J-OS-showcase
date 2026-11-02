import { ConvexError } from "convex/values";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const tracked = vi.hoisted(() => ({
	track: vi.fn((scope: string) => ({
		scope,
		clear: vi.fn(),
		pending: vi.fn(),
		// The tracker hears a failure as a rejection, and handles it.
		settle: (outcome: Promise<unknown>) => {
			outcome.catch(() => null);
		},
	})),
}));

vi.mock("@j-os/design-system", () => ({
	useSaveTracker: () => ({ track: tracked.track }),
}));

const toasts = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../toaster.ts", () => ({ toaster: toasts }));

import { createEntityPatch } from "./createEntityPatch.ts";

afterEach(() => {
	tracked.track.mockClear();
	toasts.create.mockClear();
});

const REFUSAL = { code: "Forbidden", message: "Not allowed." };

function refused(): Promise<never> {
	return Promise.reject(new ConvexError(REFUSAL));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

type Patch = { name?: string };

function setup(
	write: Parameters<typeof createEntityPatch<Patch>>[0]["write"],
	isOpen = true
) {
	return createRoot((dispose) => {
		const [key, setKey] = createSignal("row1");
		const entity = createEntityPatch<Patch>({
			key,
			write,
			isOpen: () => isOpen,
		});
		return { ...entity, setKey, dispose };
	});
}

function flush(): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test("a failing save shows its message, and a later success clears it", async () => {
	let isFailing = true;
	const entity = setup(() => (isFailing ? refused() : Promise.resolve(null)));
	entity.patch({ name: "A" });
	await flush();
	expect(entity.error()).toBe("Not allowed.");
	isFailing = false;
	entity.patch({ name: "B" });
	await flush();
	expect(entity.error()).toBeNull();
	entity.dispose();
});

test("saves to the row the change was made on, and reports each change once", async () => {
	const write = vi.fn((key: string, change: Patch) =>
		Promise.resolve({ key, change })
	);
	const entity = setup(write);
	entity.patch({ name: "A" });
	entity.setKey("row2");
	entity.patch({ name: "B" });
	await flush();
	expect(write.mock.calls).toEqual([
		["row1", { name: "A" }],
		["row2", { name: "B" }],
	]);
	expect(tracked.track).toHaveBeenCalledTimes(2);
	expect(tracked.track).toHaveBeenCalledWith("name");
	entity.dispose();
});

test("a refusal that lands after the key changed is dropped", async () => {
	const late = deferred<null>();
	const entity = setup(() => late.promise.then(refused));
	entity.patch({ name: "A" });
	entity.setKey("row2");
	late.resolve(null);
	await flush();
	expect(entity.error()).toBeNull();
	entity.dispose();
});

test("a failure once the sheet has closed toasts", async () => {
	const entity = setup(refused, false);
	entity.patch({ name: "A" });
	await flush();
	expect(toasts.create).toHaveBeenCalledWith(
		expect.objectContaining({ title: "Not allowed." })
	);
	entity.dispose();
});
