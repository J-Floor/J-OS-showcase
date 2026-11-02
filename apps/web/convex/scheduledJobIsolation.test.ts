import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const DELAY_MS = 30;
const SETTLE_MS = 150;

// convex-test runs scheduled jobs on real timers, and the email key and
// `fetch` stub are process-wide. A job its test did not finish ran in the
// next test and landed in that test's captured emails (applications.test.ts
// once counted 6 instead of 1). These two tests run in order: the first
// leaves jobs behind, the second must not see them.
describe("scheduled jobs stay inside their test", { shuffle: false }, () => {
	it("leaves an armed job and a running job behind", async () => {
		const backend = convexTest(schema, modules);
		const rejection = {
			email: "leak@example.com",
			name: "Leak",
			venture: "Leak Co",
		};
		await backend.run(async (context) => {
			await context.scheduler.runAfter(
				DELAY_MS,
				internal.notifications.sendRejectionEmail,
				rejection
			);
			await context.scheduler.runAfter(
				0,
				internal.notifications.sendRejectionEmail,
				rejection
			);
		});
		// One real turn: the 0 ms job fires and is still loading its module.
		await new Promise((resolve) => setTimeout(resolve, 0));
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(2);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RESEND_API_KEY;
	});

	it("a later test never receives an earlier test's emails", async () => {
		process.env.RESEND_API_KEY = "re_test";
		const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);
		await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
