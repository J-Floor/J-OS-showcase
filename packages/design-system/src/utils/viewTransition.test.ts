// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

import {
	captureSurfaced,
	fakeViewTransitions,
	installViewTransitions,
	restoreViewTransitions,
	transitionSettled,
} from "../test/viewTransitionFakes.ts";

import {
	PART_CLASS,
	SETTLE_CAP_MS,
	type TransitionScope,
	afterTransition,
	isTransitionRunning,
	partName,
	viewTransition,
} from "./viewTransition.ts";

type Callback = () => Promise<void> | void;

/** A fake startViewTransition: runs the callback right away, finishes on demand. */
function fakeTransitions() {
	const finishers: (() => void)[] = [];
	const start = vi.fn((callback: Callback) => {
		const done = Promise.resolve().then(() => callback());
		const finished = new Promise<void>((resolve) => {
			finishers.push(() => {
				void done.then(() => {
					resolve();
				});
			});
		});
		return { finished, updateCallbackDone: done };
	});
	installViewTransitions(start);
	return {
		start,
		finishAll: () => {
			for (const finish of finishers.splice(0)) finish();
		},
	};
}

afterEach(() => {
	restoreViewTransitions();
	delete document.documentElement.dataset.vt;
});

test("without View Transitions it runs the update synchronously", async () => {
	const update = vi.fn();
	const done = viewTransition(update);
	expect(update).toHaveBeenCalledTimes(1);
	await expect(done).resolves.toBeUndefined();
});

test("afterTransition resolves at once with none running, else when it finishes", async () => {
	await expect(afterTransition()).resolves.toBeUndefined();
	const { finishAll } = fakeTransitions();
	void viewTransition(() => {});
	let isDone = false;
	void afterTransition().then(() => {
		isDone = true;
	});
	await transitionSettled();
	expect(isDone).toBe(false);
	finishAll();
	await vi.waitFor(() => {
		expect(isDone).toBe(true);
	});
});

test("reduced motion skips the transition and runs the update", () => {
	const start = vi.fn();
	installViewTransitions(start, { reducedMotion: true });
	const update = vi.fn();
	void viewTransition(update);
	expect(start).not.toHaveBeenCalled();
	expect(update).toHaveBeenCalledTimes(1);
});

test("sets kinds and names for the transition and clears them after", async () => {
	const { finishAll } = fakeTransitions();
	const element = document.createElement("div");
	const done = viewTransition(() => {}, {
		kind: "app-page",
		names: [[element, "app-page"]],
	});
	expect(document.documentElement.dataset.vt).toBe("app-page");
	expect(element.style.getPropertyValue("view-transition-name")).toBe(
		"app-page"
	);
	await vi.waitFor(() => {
		finishAll();
		expect(document.documentElement.dataset.vt).toBeUndefined();
	});
	await done;
	expect(element.style.getPropertyValue("view-transition-name")).toBe("");
});

test("a part name carries the part class for the transition, and both clear after", async () => {
	const { finishAll } = fakeTransitions();
	const part = document.createElement("div");
	const page = document.createElement("div");
	const done = viewTransition(() => {}, {
		names: [
			[part, partName("dueDate")],
			[page, "app-page"],
		],
	});
	expect(part.style.getPropertyValue("view-transition-name")).toBe(
		"jf-morph-part-dueDate"
	);
	expect(part.style.getPropertyValue("view-transition-class")).toBe(
		PART_CLASS
	);
	expect(page.style.getPropertyValue("view-transition-class")).toBe("");
	await vi.waitFor(() => {
		finishAll();
		expect(document.documentElement.dataset.vt).toBeUndefined();
	});
	await done;
	expect(part.style.getPropertyValue("view-transition-name")).toBe("");
	expect(part.style.getPropertyValue("view-transition-class")).toBe("");
});

test("unname and a rename to another kind of name drop the part class", async () => {
	const endings = indexedTransitions();
	const renamed = document.createElement("div");
	const unnamed = document.createElement("div");
	const done = viewTransition((scope) => {
		scope.name(renamed, partName("status"));
		scope.name(renamed, "jf-morph-title");
		scope.name(unnamed, partName("owner"));
		scope.unname(unnamed);
	});
	await transitionSettled();
	expect(renamed.style.getPropertyValue("view-transition-name")).toBe(
		"jf-morph-title"
	);
	expect(renamed.style.getPropertyValue("view-transition-class")).toBe("");
	expect(unnamed.style.getPropertyValue("view-transition-name")).toBe("");
	expect(unnamed.style.getPropertyValue("view-transition-class")).toBe("");
	endings[0]?.finish();
	await done;
});

test("a key that is not a CSS ident is escaped, and distinct keys keep distinct names", () => {
	expect(partName("dueDate")).toBe("jf-morph-part-dueDate");
	const keys = ["a.b", "a b", "a_b", "1st", "a\\.b", "naïve", "x:y"];
	const names = keys.map((key) => partName(key));
	for (const name of names) expect(name).toMatch(/^jf-morph-part-/);
	expect(partName("a.b")).toBe(String.raw`jf-morph-part-a\.b`);
	expect(new Set(names).size).toBe(keys.length);
	expect(keys.map((key) => partName(key))).toEqual(names);
});

test("a call during a running update joins it instead of starting another", async () => {
	const { start, finishAll } = fakeTransitions();
	const joined = vi.fn();
	const done = viewTransition(
		() => {
			void viewTransition(joined, { kind: "tab-forward" });
		},
		{ kind: "app-page" }
	);
	await vi.waitFor(() => {
		expect(joined).toHaveBeenCalledTimes(1);
	});
	expect(start).toHaveBeenCalledTimes(1);
	expect(document.documentElement.dataset.vt).toBe("app-page tab-forward");
	finishAll();
	await done;
});

test("beforeSnapshot runs after joined updates", async () => {
	const { finishAll } = fakeTransitions();
	const order: string[] = [];
	const done = viewTransition((scope) => {
		scope.beforeSnapshot(() => order.push("snapshot"));
		void viewTransition(() => order.push("joined"));
		order.push("first");
	});
	await vi.waitFor(() => {
		expect(order).toEqual(["first", "joined", "snapshot"]);
	});
	finishAll();
	await done;
});

test("a skipped transition still resolves and cleans up", async () => {
	installViewTransitions((callback: Callback) => {
		void callback();
		return { finished: Promise.reject(new Error("skipped")) };
	});
	await expect(
		viewTransition(vi.fn(), { kind: "morph" })
	).resolves.toBeUndefined();
	expect(document.documentElement.dataset.vt).toBeUndefined();
});

/** A fake startViewTransition whose transitions finish or skip by index. */
function indexedTransitions() {
	const endings: { finish: () => void; skip: () => void }[] = [];
	const start = vi.fn((callback: Callback) => {
		const done = Promise.resolve().then(() => callback());
		const finished = new Promise<void>((resolve, reject) => {
			endings.push({
				finish: () => {
					void done.then(() => {
						resolve();
					});
				},
				skip: () => {
					void done.then(() => {
						reject(new Error("skipped"));
					});
				},
			});
		});
		return { finished, updateCallbackDone: done };
	});
	installViewTransitions(start);
	return endings;
}

/** A clock the coordinator reads through performance.now. */
function stubClock() {
	const clock = { now: 0 };
	vi.spyOn(performance, "now").mockImplementation(() => clock.now);
	return clock;
}

const PAST_THE_CAP = SETTLE_CAP_MS * 2;

test("a join made after the cap has passed still runs before the snapshot", async () => {
	const endings = indexedTransitions();
	const clock = stubClock();
	const order: string[] = [];
	const done = viewTransition(async (scope) => {
		scope.beforeSnapshot(() => order.push("snapshot"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		clock.now += PAST_THE_CAP;
		void viewTransition(() => order.push("late join"));
	});
	await vi.waitFor(() => {
		expect(order).toContain("snapshot");
	});
	expect(order).toEqual(["late join", "snapshot"]);
	expect(isTransitionRunning()).toBe(false);
	endings[0]?.finish();
	await done;
});

test("once the cap is spent, the snapshot does not wait another task", async () => {
	const endings = indexedTransitions();
	const clock = stubClock();
	const order: string[] = [];
	const done = viewTransition((scope) => {
		scope.beforeSnapshot(() => order.push("snapshot"));
		setTimeout(() => order.push("next task"), 0);
		clock.now += PAST_THE_CAP;
	});
	await vi.waitFor(() => {
		expect(order).toHaveLength(2);
	});
	expect(order).toEqual(["snapshot", "next task"]);
	endings[0]?.finish();
	await done;
});

test("a join from a synchronously invoked callback gets a promise", async () => {
	fakeViewTransitions({ sync: true });
	let joined: Promise<void> | undefined;
	const done = viewTransition(() => {
		joined = viewTransition(() => {});
	});
	expect(joined).toBeInstanceOf(Promise);
	await expect(joined).resolves.toBeUndefined();
	await done;
});

test("a kind-less transition still sets data-vt while it runs", async () => {
	const endings = indexedTransitions();
	const done = viewTransition(() => {});
	expect(document.documentElement.dataset.vt).toBe("");
	await transitionSettled();
	endings[0]?.finish();
	await done;
	expect(document.documentElement.dataset.vt).toBeUndefined();
});

test("errors from updates and snapshot callbacks are surfaced, not swallowed", async () => {
	const endings = indexedTransitions();
	const surfaced = captureSurfaced();
	const thrown = new Error("thrown");
	const rejected = new Error("rejected");
	const fromCallback = new Error("callback");
	const later = vi.fn();
	const done = viewTransition((scope) => {
		scope.beforeSnapshot(() => {
			throw fromCallback;
		});
		scope.beforeSnapshot(later);
		void viewTransition(() => {
			throw thrown;
		});
		return Promise.reject(rejected);
	});
	await vi.waitFor(() => {
		expect(later).toHaveBeenCalledTimes(1);
	});
	expect(surfaced).toEqual(
		expect.arrayContaining([thrown, rejected, fromCallback])
	);
	endings[0]?.finish();
	await done;
});

test("a rejection that settles after the cap is still surfaced", async () => {
	const endings = indexedTransitions();
	const clock = stubClock();
	const surfaced = captureSurfaced();
	const late = new Error("late");
	let rejectLater: ((reason: unknown) => void) | undefined;
	const done = viewTransition(() => {
		clock.now += PAST_THE_CAP;
		return new Promise((_resolve, reject) => {
			rejectLater = reject;
		});
	});
	await transitionSettled();
	rejectLater?.(late);
	await vi.waitFor(() => {
		expect(surfaced).toEqual([late]);
	});
	endings[0]?.finish();
	await done;
});

test("a skipped session's cleanup leaves the newer session's names and data-vt", async () => {
	const endings = indexedTransitions();
	const shared = document.createElement("div");
	const onlyFirst = document.createElement("div");
	const first = viewTransition(() => {}, {
		kind: "app-page",
		names: [
			[shared, "app-page"],
			[onlyFirst, "jf-morph"],
		],
	});
	await transitionSettled();
	const second = viewTransition(() => {}, {
		kind: "tab-forward",
		names: [[shared, "jf-tab"]],
	});
	endings[0]?.skip();
	await first;
	expect(onlyFirst.style.getPropertyValue("view-transition-name")).toBe("");
	expect(shared.style.getPropertyValue("view-transition-name")).toBe(
		"jf-tab"
	);
	expect(document.documentElement.dataset.vt).toBe("tab-forward");
	await vi.waitFor(() => {
		expect(endings).toHaveLength(2);
	});
	endings[1]?.finish();
	await second;
	expect(shared.style.getPropertyValue("view-transition-name")).toBe("");
	expect(document.documentElement.dataset.vt).toBeUndefined();
});

test("unname leaves an element another session owns", async () => {
	const endings = indexedTransitions();
	const shared = document.createElement("div");
	let firstScope: TransitionScope | undefined;
	const first = viewTransition((scope) => {
		firstScope = scope;
	});
	await transitionSettled();
	const second = viewTransition(
		() => {
			firstScope?.unname(shared);
		},
		{ names: [[shared, "app-page"]] }
	);
	await transitionSettled();
	expect(shared.style.getPropertyValue("view-transition-name")).toBe(
		"app-page"
	);
	endings[0]?.skip();
	await first;
	await vi.waitFor(() => {
		expect(endings).toHaveLength(2);
	});
	endings[1]?.finish();
	await second;
});

test("a second jf-morph in one session keeps the first", async () => {
	const endings = indexedTransitions();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const first = document.createElement("div");
	const second = document.createElement("div");
	const done = viewTransition((scope) => {
		scope.name(first, "jf-morph");
		scope.name(second, "jf-morph");
	});
	await transitionSettled();
	expect(first.style.getPropertyValue("view-transition-name")).toBe(
		"jf-morph"
	);
	expect(second.style.getPropertyValue("view-transition-name")).toBe("");
	expect(warn).toHaveBeenCalledTimes(1);
	endings[0]?.finish();
	await done;
});

test("it runs the update where Promise.withResolvers does not exist", async () => {
	const endings = indexedTransitions();
	vi.spyOn(Promise, "withResolvers").mockImplementation(() => {
		throw new TypeError("Promise.withResolvers is not a function");
	});
	const update = vi.fn();
	const done = viewTransition(update);
	await vi.waitFor(() => {
		expect(update).toHaveBeenCalledTimes(1);
	});
	endings[0]?.finish();
	await done;
});

test("a beforeSnapshot registered after the session drained runs right away", async () => {
	const endings = indexedTransitions();
	let captured: TransitionScope | undefined;
	const done = viewTransition((scope) => {
		captured = scope;
	});
	await transitionSettled();
	const late = vi.fn();
	captured?.beforeSnapshot(late);
	expect(late).toHaveBeenCalledTimes(1);
	endings[0]?.finish();
	await done;
});

/** A startViewTransition that throws, as in a hidden document. */
function throwingTransitions(): void {
	installViewTransitions(() => {
		throw new DOMException("hidden", "InvalidStateError");
	});
}

test("if startViewTransition throws, the update still runs and nothing stays stuck", async () => {
	throwingTransitions();
	const element = document.createElement("div");
	const order: string[] = [];
	const done = viewTransition(
		(scope) => {
			scope.beforeSnapshot(() => order.push("snapshot"));
			order.push("update");
		},
		{ kind: "app-page", names: [[element, "app-page"]] }
	);
	expect(order).toEqual(["update", "snapshot"]);
	expect(isTransitionRunning()).toBe(false);
	expect(document.documentElement.dataset.vt).toBeUndefined();
	expect(element.style.getPropertyValue("view-transition-name")).toBe("");
	await expect(done).resolves.toBeUndefined();
	const next = vi.fn();
	await viewTransition(next);
	expect(next).toHaveBeenCalledTimes(1);
});

test("opposite directional kinds replace each other; the latest wins", async () => {
	const endings = indexedTransitions();
	const done = viewTransition(
		() => {
			void viewTransition(() => {}, { kind: "tab-back" });
			void viewTransition(() => {}, { kind: "sheet-next" });
			void viewTransition(() => {}, { kind: "sheet-prev" });
		},
		{ kind: "tab-forward" }
	);
	await transitionSettled();
	expect(document.documentElement.dataset.vt).toBe("tab-back sheet-prev");
	endings[0]?.finish();
	await done;
});

test("the drain clears the cap timer it no longer needs", async () => {
	const endings = indexedTransitions();
	const capTimers = new Set<unknown>();
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;
	vi.stubGlobal("setTimeout", (handler: () => void, ms?: number) => {
		const id = realSetTimeout(handler, ms);
		if (ms !== undefined && ms > 0) capTimers.add(id);
		return id;
	});
	vi.stubGlobal("clearTimeout", (id: ReturnType<typeof setTimeout>) => {
		capTimers.delete(id);
		realClearTimeout(id);
	});
	const done = viewTransition(() => {});
	await transitionSettled();
	expect(capTimers.size).toBe(0);
	endings[0]?.finish();
	await done;
});

test("without the API an update's error is surfaced, not thrown at the caller", async () => {
	const surfaced = captureSurfaced();
	const thrown = new Error("thrown");
	const rejected = new Error("rejected");
	let done: Promise<void> | undefined;
	expect(() => {
		done = viewTransition(() => {
			throw thrown;
		});
	}).not.toThrow();
	await expect(done).resolves.toBeUndefined();
	await expect(
		viewTransition(() => Promise.reject(rejected))
	).resolves.toBeUndefined();
	expect(surfaced).toEqual([thrown, rejected]);
});

test("without the API each call gets its own scope", () => {
	const scopes: TransitionScope[] = [];
	void viewTransition((scope) => {
		scopes.push(scope);
	});
	void viewTransition((scope) => {
		scopes.push(scope);
	});
	expect(scopes).toHaveLength(2);
	expect(scopes[0]).not.toBe(scopes[1]);
});

test("if startViewTransition throws, the developer is told", () => {
	throwingTransitions();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	void viewTransition(() => {});
	expect(warn).toHaveBeenCalledTimes(1);
});

test("a rejected ready promise is handled", async () => {
	const caught: unknown[] = [];
	installViewTransitions((callback: Callback) => {
		const done = Promise.resolve().then(() => callback());
		const ready = Promise.reject(
			new DOMException("duplicate name", "InvalidStateError")
		);
		caught.push(vi.spyOn(ready, "catch"));
		return { finished: done, updateCallbackDone: done, ready };
	});
	await viewTransition(() => {});
	expect(caught).toHaveLength(1);
	expect(caught[0]).toHaveBeenCalledTimes(1);
});
