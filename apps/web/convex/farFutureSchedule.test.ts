import { convexTest } from "convex-test";
import { expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const THIRTY_DAYS = 30 * 86_400_000;
const SETTLE_MS = 50;

// convex-test arms a scheduled job with `setTimeout(scheduledTime - now)`.
// Past Node's 32-bit timer limit (~24.8 days) that fires after 1 ms, so a
// guest's 30-day window job ran in the middle of whatever test came next.
it("a job scheduled 30 days out does not run during the test", async () => {
	const backend = convexTest(schema, modules);
	const accessUntil = Date.now() + THIRTY_DAYS;
	await backend.run(async (context) => {
		const personId = await context.db.insert("people", {
			email: "guest@example.com",
			firstName: "Gus",
			lastName: "",
			tier: "guest",
			stage: "active",
			stageSince: Date.now(),
			accessUntil,
		});
		await context.scheduler.runAt(
			accessUntil,
			internal.notify.guests.expiringSoon,
			{ personId, accessUntil }
		);
	});
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	expect(jobs.map((job) => job.state.kind)).toEqual(["pending"]);
});
