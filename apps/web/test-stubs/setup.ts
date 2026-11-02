import type { convexTest } from "convex-test";
import { afterEach, vi } from "vitest";

import type { Id } from "../convex/_generated/dataModel";

// convex-test arms each scheduled job with `setTimeout(scheduledTime - now)`.
// Node fires any delay past its 32-bit limit (~24.8 days) after 1 ms, so a
// guest's 30-day window job ran at once, in the middle of whichever test came
// next. A job that far out never comes due during a test: arm nothing.
const MAX_TIMER_MS = 2 ** 31 - 1;
const realSetTimeout = globalThis.setTimeout;
function guardedSetTimeout(
	handler: TimerHandler,
	timeout?: number,
	...args: unknown[]
) {
	const isTooFar = timeout !== undefined && timeout > MAX_TIMER_MS;
	return realSetTimeout(
		isTooFar ? () => {} : handler,
		isTooFar ? MAX_TIMER_MS : timeout,
		...(isTooFar ? [] : args)
	);
}
globalThis.setTimeout = guardedSetTimeout as unknown as typeof setTimeout;

// A job convex-test has not finished when its test ends runs later, in some
// other test, against that test's `fetch` stub and env: decide()'s approval
// emails once landed in a submitApplication test's captured emails. So every
// backend a test creates is closed when the test ends: jobs still waiting are
// cancelled, running ones are awaited, until none is left.
type Backend = ReturnType<typeof convexTest>;
const { openBackends } = vi.hoisted(() => ({
	openBackends: new Set<Backend>(),
}));
vi.mock("convex-test", async (importOriginal) => {
	const actual = await importOriginal<typeof import("convex-test")>();
	function trackedConvexTest(...args: Parameters<typeof convexTest>) {
		const backend = actual.convexTest(...args);
		openBackends.add(backend);
		return backend;
	}
	return { ...actual, convexTest: trackedConvexTest };
});

async function settleScheduledJobs(backend: Backend) {
	let running: number;
	do {
		await backend.finishInProgressScheduledFunctions();
		running = await backend.run(async (context) => {
			const waiting: Id<"_scheduled_functions">[] = [];
			let inProgress = 0;
			for await (const job of context.db.system.query(
				"_scheduled_functions"
			)) {
				if (job.state.kind === "pending") waiting.push(job._id);
				if (job.state.kind === "inProgress") inProgress += 1;
			}
			for (const id of waiting) await context.scheduler.cancel(id);
			return inProgress;
		});
	} while (running > 0);
}

afterEach(async () => {
	const backends = [...openBackends];
	openBackends.clear();
	for (const backend of backends) await settleScheduledJobs(backend);
});

// jsdom lacks these; ark-ui machines and the design-system table touch them.
// Edge-runtime suites have no DOM, so there is nothing to fill in.
if (typeof Element !== "undefined") {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	if (!Reflect.has(Element.prototype, "scrollTo")) {
		Element.prototype.scrollTo = () => {};
	}
	if (!Reflect.has(Element.prototype, "hasPointerCapture")) {
		Element.prototype.hasPointerCapture = () => false;
	}
}

// See packages/design-system/vitest.setup.ts: design-system tables and sheets
// defer their bodies by one paint; tests assert synchronously.
//
// DOM suites only. The Convex suites run under edge-runtime, where importing
// the design-system barrel crashes (Solid's web runtime needs `window`), so
// they must never load it.
if (typeof document !== "undefined") {
	const { setDeferredImmediate } = await import("@j-os/design-system");
	setDeferredImmediate(true);
}
