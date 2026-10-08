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
	const t = convexTest(schema, modules);
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { t, asBoard: t.withIdentity({ email: BOARD_EMAIL }) };
}

function local(ms: number): string {
	return zonedLocalFromEpoch(ms, SITE_TIMEZONE);
}

async function jobs(t: TestConvex<typeof schema>) {
	return t.run((ctx) =>
		ctx.db.system.query("_scheduled_functions").collect()
	);
}

async function reminderJobs(t: TestConvex<typeof schema>) {
	return (await jobs(t)).filter((j) =>
		j.name.startsWith("notify/eventReminders:")
	);
}

async function eventRow(t: TestConvex<typeof schema>, id: Id<"events">) {
	return t.run((ctx) => ctx.db.get(id));
}

describe("event reminders", () => {
	it("schedules 30 minutes before the start and 15 before the end", async () => {
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = await eventRow(t, id);
		const pending = await reminderJobs(t);
		expect(pending.map((j) => j.name).sort()).toEqual([
			"notify/eventReminders:endingSoon",
			"notify/eventReminders:startingSoon",
		]);
		const startJob = pending.find((j) => j.name.endsWith(":startingSoon"));
		const endJob = pending.find((j) => j.name.endsWith(":endingSoon"));
		expect(startJob?.scheduledTime).toBe(event!.startsAt - 30 * 60_000);
		expect(endJob?.scheduledTime).toBe(event!.endsAt - 15 * 60_000);
		expect(event?.reminderJobIds).toEqual({
			startingSoon: startJob?._id,
			endingSoon: endJob?._id,
		});
	});

	it("skips reminders whose time has already passed", async () => {
		const { t, asBoard } = await setup();
		await asBoard.mutation(api.events.createEvent, {
			name: "Past",
			startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
		});
		expect(await reminderJobs(t)).toEqual([]);
	});

	it("moving the start cancels the old reminder and schedules a new one", async () => {
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const before = (await eventRow(t, id))!.reminderJobIds!;
		await asBoard.mutation(api.events.updateEvent, {
			eventId: id,
			startsAtLocal: local(start + HOUR),
		});
		const after = (await eventRow(t, id))!.reminderJobIds!;
		const all = await jobs(t);
		function state(jobId: string | undefined) {
			return all.find((j) => j._id === jobId)?.state.kind;
		}
		expect(state(before.startingSoon)).toBe("canceled");
		expect(state(after.startingSoon)).toBe("pending");
		expect(after.startingSoon).not.toBe(before.startingSoon);
	});

	it("renaming does not reschedule (the handler reads the name when it fires)", async () => {
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const before = (await eventRow(t, id))!.reminderJobIds;
		await asBoard.mutation(api.events.updateEvent, {
			eventId: id,
			name: "Demo Night II",
		});
		expect((await eventRow(t, id))!.reminderJobIds).toEqual(before);
	});

	it("deleting the event cancels both reminders", async () => {
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		await asBoard.mutation(api.events.deleteEvent, { eventId: id });
		const states = (await reminderJobs(t)).map((j) => j.state.kind);
		expect(states).toEqual(["canceled", "canceled"]);
	});

	it("a reminder fires the notification with the current name", async () => {
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = (await eventRow(t, id))!;
		await t.mutation(internal.notify.eventReminders.startingSoon, {
			eventId: id,
			startsAt: event.startsAt,
		});
		await t.mutation(internal.notify.eventReminders.endingSoon, {
			eventId: id,
			endsAt: event.endsAt,
		});
		const dispatched = (await jobs(t))
			.filter((j) => j.name === "notify/dispatch:run")
			.map((j): unknown => j.args[0]);
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
		const { t, asBoard } = await setup();
		const start = Date.now() + 2 * DAY;
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo Night",
			startsAtLocal: local(start),
			endsAtLocal: local(start + 3 * HOUR),
		});
		const event = (await eventRow(t, id))!;
		await t.mutation(internal.notify.eventReminders.startingSoon, {
			eventId: id,
			startsAt: event.startsAt - HOUR,
		});
		await asBoard.mutation(api.events.deleteEvent, { eventId: id });
		await t.mutation(internal.notify.eventReminders.endingSoon, {
			eventId: id,
			endsAt: event.endsAt,
		});
		expect(
			(await jobs(t)).some((j) => j.name === "notify/dispatch:run")
		).toBe(false);
	});
});
