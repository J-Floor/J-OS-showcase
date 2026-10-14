import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "../lib/time.ts";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BOARD_EMAIL = "boss@example.com";

async function setup() {
	const backend = convexTest(schema, modules);
	await backend.run((context) =>
		context.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { backend, asBoard: backend.withIdentity({ email: BOARD_EMAIL }) };
}

function local(ms: number): string {
	return zonedLocalFromEpoch(ms, SITE_TIMEZONE);
}

async function jobs(backend: TestConvex<typeof schema>) {
	return backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
}

async function reminderJobs(backend: TestConvex<typeof schema>) {
	const allJobs = await jobs(backend);
	return allJobs.filter((job) =>
		job.name.startsWith("notify/eventReminders:")
	);
}

async function eventRow(backend: TestConvex<typeof schema>, id: Id<"events">) {
	return backend.run((context) => context.db.get(id));
}

describe("event reminders", () => {
	it("schedules 30 minutes before the start and 15 before the end", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = await eventRow(backend, id);
		const pending = await reminderJobs(backend);
		expect(
			pending
				.map((job) => job.name)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual([
			"notify/eventReminders:endingSoon",
			"notify/eventReminders:startingSoon",
		]);
		const startJob = pending.find((job) =>
			job.name.endsWith(":startingSoon")
		);
		const endJob = pending.find((job) => job.name.endsWith(":endingSoon"));
		expect(startJob?.scheduledTime).toBe(event!.startsAt - 30 * 60_000);
		expect(endJob?.scheduledTime).toBe(event!.endsAt - 15 * 60_000);
		expect(event?.reminderJobIds).toEqual({
			startingSoon: startJob?._id,
			endingSoon: endJob?._id,
		});
	});

	it("skips reminders whose time has already passed", async () => {
		const { backend, asBoard } = await setup();
		await asBoard.mutation(api.events.createEvent, {
			name: "Past",
			startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
		});
		expect(await reminderJobs(backend)).toEqual([]);
	});

	it("moving the start cancels the old reminder and schedules a new one", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const before = (await eventRow(backend, id))!.reminderJobIds!;
		await asBoard.mutation(api.events.updateEvent, {
			eventId: id,
			startsAtLocal: local(start + HOUR),
		});
		const after = (await eventRow(backend, id))!.reminderJobIds!;
		const all = await jobs(backend);
		function state(jobId: string | undefined) {
			return all.find((job) => job._id === jobId)?.state.kind;
		}
		expect(state(before.startingSoon)).toBe("canceled");
		expect(state(after.startingSoon)).toBe("pending");
		expect(after.startingSoon).not.toBe(before.startingSoon);
	});

	it("renaming does not reschedule (the handler reads the name when it fires)", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const before = (await eventRow(backend, id))!.reminderJobIds;
		await asBoard.mutation(api.events.updateEvent, {
			eventId: id,
			name: "Demo Night II",
		});
		const after = await eventRow(backend, id);
		expect(after!.reminderJobIds).toEqual(before);
	});

	it("deleting the event cancels both reminders", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		await asBoard.mutation(api.events.deleteEvent, { eventId: id });
		const reminders = await reminderJobs(backend);
		const states = reminders.map((job) => job.state.kind);
		expect(states).toEqual(["canceled", "canceled"]);
	});

	it("a reminder fires the notification with the current name", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = (await eventRow(backend, id))!;
		await backend.mutation(internal.notify.eventReminders.startingSoon, {
			eventId: id,
			startsAt: event.startsAt,
		});
		await backend.mutation(internal.notify.eventReminders.endingSoon, {
			eventId: id,
			endsAt: event.endsAt,
		});
		const allJobs = await jobs(backend);
		const dispatched = allJobs
			.filter((job) => job.name === "notify/dispatch:run")
			.map((job): unknown => job.args[0]);
		expect(dispatched).toEqual([
			{
				kind: "eventStartingSoon",
				payload: {
					eventId: id,
					name: "Demo Night",
					startsAtLocal: event.startsAtLocal,
				},
			},
			{
				kind: "eventEndingSoon",
				payload: {
					eventId: id,
					name: "Demo Night",
					endsAtLocal: event.endsAtLocal,
				},
			},
		]);
	});

	it("a stale reminder (time moved, or event deleted) does nothing", async () => {
		const { backend, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = (await eventRow(backend, id))!;
		await backend.mutation(internal.notify.eventReminders.startingSoon, {
			eventId: id,
			startsAt: event.startsAt - HOUR,
		});
		await asBoard.mutation(api.events.deleteEvent, { eventId: id });
		await backend.mutation(internal.notify.eventReminders.endingSoon, {
			eventId: id,
			endsAt: event.endsAt,
		});
		const allJobs = await jobs(backend);
		expect(allJobs.some((job) => job.name === "notify/dispatch:run")).toBe(
			false
		);
	});
});
