import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	checkForUpdateNow,
	isUpdating,
	setUpdatingForTest,
	startPwaUpdateChecks,
	startReloadOnUpdate,
	UPDATE_OVERLAY_TIMEOUT_MS,
} from "./pwaUpdates.ts";

/** A fake `document`: a real EventTarget (so `dispatchEvent` behaves exactly
 * like the DOM) plus a mutable `visibilityState`, avoiding jsdom entirely so
 * this test runs under the default edge-runtime environment. */
function createFakeDoc(
	visibilityState: DocumentVisibilityState = "visible"
): EventTarget & { visibilityState: DocumentVisibilityState } {
	return Object.assign(new EventTarget(), { visibilityState });
}

function createFakeRegistration(): {
	registration: ServiceWorkerRegistration;
	update: ReturnType<typeof vi.fn>;
} {
	const update = vi.fn().mockResolvedValue(undefined);
	return {
		registration: { update } as unknown as ServiceWorkerRegistration,
		update,
	};
}

describe("startPwaUpdateChecks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls update when the page becomes visible, not when it becomes hidden", () => {
		const { registration, update } = createFakeRegistration();
		const doc = createFakeDoc("visible");
		startPwaUpdateChecks(registration, { doc, isOnline: () => true });

		doc.visibilityState = "hidden";
		doc.dispatchEvent(new Event("visibilitychange"));
		expect(update).not.toHaveBeenCalled();

		doc.visibilityState = "visible";
		doc.dispatchEvent(new Event("visibilitychange"));
		expect(update).toHaveBeenCalledTimes(1);
	});

	it("calls update on the 60-minute interval", () => {
		const { registration, update } = createFakeRegistration();
		const doc = createFakeDoc("visible");
		startPwaUpdateChecks(registration, { doc, isOnline: () => true });

		vi.advanceTimersByTime(59 * 60 * 1000);
		expect(update).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1 * 60 * 1000);
		expect(update).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(update).toHaveBeenCalledTimes(2);
	});

	it("does nothing while offline, on both the visibility trigger and the interval, then resumes once back online", () => {
		const { registration, update } = createFakeRegistration();
		const doc = createFakeDoc("visible");
		// A mutable flag, not a constant `() => false`: the check must be
		// re-evaluated on each trigger, not just skipped once at setup.
		let online = false;
		startPwaUpdateChecks(registration, { doc, isOnline: () => online });

		doc.dispatchEvent(new Event("visibilitychange"));
		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(update).not.toHaveBeenCalled();

		online = true;
		doc.dispatchEvent(new Event("visibilitychange"));
		expect(update).toHaveBeenCalledTimes(1);
	});

	it("cleanup removes the visibility listener and clears the interval", () => {
		const { registration, update } = createFakeRegistration();
		const doc = createFakeDoc("visible");
		const addSpy = vi.spyOn(doc, "addEventListener");
		const removeSpy = vi.spyOn(doc, "removeEventListener");

		const cleanup = startPwaUpdateChecks(registration, {
			doc,
			isOnline: () => true,
		});
		cleanup();

		expect(removeSpy).toHaveBeenCalledTimes(1);
		// Same listener reference that was registered, not just any function.
		expect(removeSpy.mock.calls[0][1]).toBe(addSpy.mock.calls[0][1]);

		doc.dispatchEvent(new Event("visibilitychange"));
		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(update).not.toHaveBeenCalled();
	});

	it("does nothing and returns a no-op cleanup when registration is undefined", () => {
		const doc = createFakeDoc("visible");
		const addSpy = vi.spyOn(doc, "addEventListener");

		const cleanup = startPwaUpdateChecks(undefined, {
			doc,
			isOnline: () => true,
		});

		expect(addSpy).not.toHaveBeenCalled();
		expect(() => {
			cleanup();
		}).not.toThrow();
	});
});

function createFakeContainer(hasController: boolean) {
	return Object.assign(new EventTarget(), {
		controller: hasController ? {} : null,
	});
}

function createFakeWatchedRegistration(installing: boolean) {
	return Object.assign(new EventTarget(), {
		installing: installing ? {} : null,
	}) as unknown as ServiceWorkerRegistration;
}

describe("startReloadOnUpdate", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setUpdatingForTest(false);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reloads once when a new worker takes over a controlled page", () => {
		const container = createFakeContainer(true);
		const reload = vi.fn();
		startReloadOnUpdate({ container, reload });

		container.dispatchEvent(new Event("controllerchange"));
		container.dispatchEvent(new Event("controllerchange"));

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("does not reload on a first install", () => {
		const container = createFakeContainer(false);
		const reload = vi.fn();
		startReloadOnUpdate({ container, reload });

		container.dispatchEvent(new Event("controllerchange"));

		expect(reload).not.toHaveBeenCalled();
	});

	it("does nothing without service-worker support", () => {
		const watch = startReloadOnUpdate({ container: null, reload: vi.fn() });
		watch(createFakeWatchedRegistration(true));
		expect(isUpdating()).toBe(false);
	});

	it("shows the overlay when a worker is already installing at registration", () => {
		const watch = startReloadOnUpdate({
			container: createFakeContainer(true),
			reload: vi.fn(),
		});

		watch(createFakeWatchedRegistration(true));

		expect(isUpdating()).toBe(true);
	});

	it("shows the overlay on a later updatefound", () => {
		const watch = startReloadOnUpdate({
			container: createFakeContainer(true),
			reload: vi.fn(),
		});
		const registration = createFakeWatchedRegistration(false);

		watch(registration);
		expect(isUpdating()).toBe(false);

		registration.dispatchEvent(new Event("updatefound"));
		expect(isUpdating()).toBe(true);
	});

	it("never shows the overlay on a first install", () => {
		const watch = startReloadOnUpdate({
			container: createFakeContainer(false),
			reload: vi.fn(),
		});
		const registration = createFakeWatchedRegistration(true);

		watch(registration);
		registration.dispatchEvent(new Event("updatefound"));

		expect(isUpdating()).toBe(false);
	});

	it("hides the overlay if no reload comes within the timeout", () => {
		const watch = startReloadOnUpdate({
			container: createFakeContainer(true),
			reload: vi.fn(),
		});
		watch(createFakeWatchedRegistration(true));

		vi.advanceTimersByTime(UPDATE_OVERLAY_TIMEOUT_MS - 1);
		expect(isUpdating()).toBe(true);

		vi.advanceTimersByTime(1);
		expect(isUpdating()).toBe(false);
	});

	it("ignores an undefined registration", () => {
		const watch = startReloadOnUpdate({
			container: createFakeContainer(true),
			reload: vi.fn(),
		});
		expect(() => {
			watch(undefined);
		}).not.toThrow();
		expect(isUpdating()).toBe(false);
	});
});

describe("checkForUpdateNow", () => {
	it("calls update on the registration startPwaUpdateChecks received", () => {
		const { registration, update } = createFakeRegistration();
		const stop = startPwaUpdateChecks(registration, {
			doc: createFakeDoc(),
			isOnline: () => true,
		});
		checkForUpdateNow();
		expect(update).toHaveBeenCalledTimes(1);
		stop();
	});

	it("does nothing while offline", () => {
		const { registration, update } = createFakeRegistration();
		const stop = startPwaUpdateChecks(registration, {
			doc: createFakeDoc(),
			isOnline: () => false,
		});
		checkForUpdateNow();
		expect(update).not.toHaveBeenCalled();
		stop();
	});

	it("does nothing after cleanup", () => {
		const { registration, update } = createFakeRegistration();
		const stop = startPwaUpdateChecks(registration, {
			doc: createFakeDoc(),
			isOnline: () => true,
		});
		stop();
		checkForUpdateNow();
		expect(update).not.toHaveBeenCalled();
	});

	it("drops an earlier registration when called with none", () => {
		const { registration, update } = createFakeRegistration();
		startPwaUpdateChecks(registration, {
			doc: createFakeDoc(),
			isOnline: () => true,
		});
		startPwaUpdateChecks(undefined);
		checkForUpdateNow();
		expect(update).not.toHaveBeenCalled();
	});

	it("swallows a rejected update", async () => {
		const { registration, update } = createFakeRegistration();
		update.mockRejectedValueOnce(new Error("offline race"));
		const stop = startPwaUpdateChecks(registration, {
			doc: createFakeDoc(),
			isOnline: () => true,
		});
		checkForUpdateNow();
		await Promise.resolve();
		expect(update).toHaveBeenCalledTimes(1);
		stop();
	});
});
