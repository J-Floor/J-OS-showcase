import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema.ts";

import { hasAttendance } from "./attendance.ts";

const modules = import.meta.glob("../**/*.*s");

describe("hasAttendance", () => {
	it("is true only for the (person, event) pair that has a row", async () => {
		const t = convexTest(schema, modules);
		const result = await t.run(async (ctx) => {
			function person(email: string) {
				return ctx.db.insert("people", {
					email,
					firstName: "A",
					lastName: "B",
					tier: "member",
					stage: "active",
					stageSince: Date.now(),
				});
			}
			const personId = await person("a@example.com");
			const otherId = await person("b@example.com");
			function event() {
				return ctx.db.insert("events", {
					name: "E",
					startsAt: 0,
					endsAt: 1,
					startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
					endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
					createdBy: personId,
					createdAt: 0,
				});
			}
			const eventA = await event();
			const eventB = await event();
			await ctx.db.insert("eventAttendance", {
				personId,
				eventId: eventA,
				confirmedAt: 0,
			});
			return {
				hit: await hasAttendance(ctx.db, personId, eventA),
				otherEvent: await hasAttendance(ctx.db, personId, eventB),
				otherPerson: await hasAttendance(ctx.db, otherId, eventA),
			};
		});
		expect(result).toEqual({
			hit: true,
			otherEvent: false,
			otherPerson: false,
		});
	});
});
