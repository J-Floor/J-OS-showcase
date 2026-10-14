import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import schema from "../schema.ts";

import { KINDS, kindValidator } from "./registry.ts";
import type { Recipient } from "./types.ts";

const modules = import.meta.glob("../**/*.*s");
const DAY = 86_400_000;

type Seed = {
	email: string;
	tier: "guest" | "member" | "core" | "board" | "admin" | "former";
	stage?: "active" | "onboarding" | "expired";
	accessUntil?: number;
	hostedById?: Id<"people">;
};

async function seed(
	backend: ReturnType<typeof convexTest>,
	person: Seed
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email: person.email,
			firstName: person.email.split("@")[0],
			lastName: "X",
			tier: person.tier,
			stage: person.stage ?? "active",
			stageSince: Date.now(),
			accessUntil: person.accessUntil,
			hostedById: person.hostedById,
		})
	);
}

function recipient(personId: string, firstName = "Ada"): Recipient {
	return {
		personId: personId as Id<"people">,
		email: `${firstName}@example.org`,
		firstName,
		tier: "member",
		prefs: undefined,
	};
}

function sorted(ids: string[]): string[] {
	// eslint-disable-next-line id-length -- conventional comparator parameter names
	return [...ids].sort((a, b) => a.localeCompare(b));
}

beforeEach(() => {
	vi.stubEnv("SITE_URL", "https://j.floor");
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("registry", () => {
	it("validates exactly the registered kind names", () => {
		expect(
			sorted(kindValidator.members.map((member) => member.value))
		).toEqual(sorted(Object.keys(KINDS)));
	});

	it("gives every kind an email except the push-only event reminders", () => {
		for (const [name, definition] of Object.entries(KINDS)) {
			expect(definition.push, name).toBeTypeOf("function");
			if (name === "eventEndingSoon" || name === "eventStartingSoon")
				expect(definition.email).toBeUndefined();
			else expect(definition.email, name).toBeTypeOf("function");
		}
	});
});

describe("event reminders", () => {
	it("have no email side", () => {
		expect(KINDS.eventStartingSoon.email).toBeUndefined();
		expect(KINDS.eventEndingSoon.email).toBeUndefined();
	});
});

describe("audiences", () => {
	it("board kinds reach entitled board and admin only", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "b@example.org",
			tier: "board",
		});
		const admin = await seed(backend, {
			email: "a@example.org",
			tier: "admin",
		});
		await seed(backend, { email: "m@example.org", tier: "member" });
		await seed(backend, { email: "f@example.org", tier: "former" });
		const ids = await backend.run((context) =>
			KINDS.doorAlert.audience(context, {
				headline: "h",
				detail: "d",
				consequence: "c",
				tag: "door",
			})
		);
		expect(sorted(ids)).toEqual(sorted([board, admin]));
	});

	it("event reminders reach every entitled access tier", async () => {
		const backend = convexTest(schema, modules);
		const member = await seed(backend, {
			email: "m@example.org",
			tier: "member",
		});
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + DAY,
		});
		await seed(backend, {
			email: "late@example.org",
			tier: "guest",
			accessUntil: Date.now() - DAY,
		});
		await seed(backend, { email: "f@example.org", tier: "former" });
		const eventId = await backend.run(async (context) =>
			context.db.insert("events", {
				name: "Demo",
				startsAt: Date.now() + DAY,
				endsAt: Date.now() + DAY + 3_600_000,
				startsAtLocal: "2026-10-10T18:00:00+02:00[Europe/Zurich]",
				endsAtLocal: "2026-10-10T19:00:00+02:00[Europe/Zurich]",
				createdBy: member,
				createdAt: Date.now(),
			})
		);
		const ids = await backend.run((context) =>
			KINDS.eventStartingSoon.audience(context, {
				eventId,
				name: "Demo",
				startsAtLocal: "2026-10-10T18:00:00+02:00[Europe/Zurich]",
			})
		);
		expect(sorted(ids)).toEqual(sorted([member, guest]));
	});

	it("task assignment reaches the assignee only while they are entitled", async () => {
		const backend = convexTest(schema, modules);
		const member = await seed(backend, {
			email: "m@example.org",
			tier: "member",
		});
		const former = await seed(backend, {
			email: "f@example.org",
			tier: "former",
		});
		const taskId = await backend.run((context) =>
			context.db.insert("tasks", {
				title: "Wire it",
				status: "backlog",
				assigneeIds: [],
				createdBy: member,
			})
		);
		const toMember = await backend.run((context) =>
			KINDS.taskAssigned.audience(context, {
				assigneeId: member,
				taskId,
				taskTitle: "Wire it",
			})
		);
		const toFormer = await backend.run((context) =>
			KINDS.taskAssigned.audience(context, {
				assigneeId: former,
				taskId,
				taskTitle: "Wire it",
			})
		);
		expect(toMember).toEqual([member]);
		expect(toFormer).toEqual([]);
	});

	it("guest expiring soon reaches the guest and their host once each, not the rest of the board", async () => {
		const backend = convexTest(schema, modules);
		const hostBoard = await seed(backend, {
			email: "host@example.org",
			tier: "board",
		});
		const otherBoard = await seed(backend, {
			email: "b2@example.org",
			tier: "board",
		});
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + 2 * DAY,
			hostedById: hostBoard,
		});
		const ids = await backend.run((context) =>
			KINDS.guestExpiringSoon.audience(context, {
				guestId: guest,
				guestName: "g X",
				untilDate: "6 October 2026",
			})
		);
		expect(sorted(ids)).toEqual(sorted([guest, hostBoard]));
		expect(ids).not.toContain(otherBoard);
	});

	it("guest expired reaches the guest whose window just closed and their host, not the rest of the board", async () => {
		const backend = convexTest(schema, modules);
		const host = await seed(backend, {
			email: "host@example.org",
			tier: "member",
		});
		const otherBoard = await seed(backend, {
			email: "b@example.org",
			tier: "board",
		});
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			stage: "expired",
			accessUntil: Date.now() - DAY,
			hostedById: host,
		});
		const ids = await backend.run((context) =>
			KINDS.guestExpired.audience(context, {
				guestId: guest,
				guestName: "g X",
			})
		);
		expect(sorted(ids)).toEqual(sorted([guest, host]));
		expect(ids).not.toContain(otherBoard);
	});

	it("a guest with no host is the whole audience for expiring soon and expired", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, { email: "b@example.org", tier: "board" });
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + 2 * DAY,
		});
		const soon = await backend.run((context) =>
			KINDS.guestExpiringSoon.audience(context, {
				guestId: guest,
				guestName: "g X",
				untilDate: "6 October 2026",
			})
		);
		const expired = await backend.run((context) =>
			KINDS.guestExpired.audience(context, {
				guestId: guest,
				guestName: "g X",
			})
		);
		expect(soon).toEqual([guest]);
		expect(expired).toEqual([guest]);
	});

	it("guest expired keeps the guest but drops a host who is no longer entitled", async () => {
		const backend = convexTest(schema, modules);
		const formerHost = await seed(backend, {
			email: "host@example.org",
			tier: "former",
		});
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			stage: "expired",
			accessUntil: Date.now() - DAY,
			hostedById: formerHost,
		});
		const ids = await backend.run((context) =>
			KINDS.guestExpired.audience(context, {
				guestId: guest,
				guestName: "g X",
			})
		);
		expect(ids).toEqual([guest]);
	});

	it("guest access changes reach the guest and the host, not the whole board", async () => {
		const backend = convexTest(schema, modules);
		const host = await seed(backend, {
			email: "host@example.org",
			tier: "board",
		});
		await seed(backend, { email: "b2@example.org", tier: "board" });
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + 30 * DAY,
			hostedById: host,
		});
		const ids = await backend.run((context) =>
			KINDS.guestAccessChanged.audience(context, {
				guestId: guest,
				guestName: "g X",
				change: "extended",
				untilDate: "3 November 2026",
			})
		);
		expect(sorted(ids)).toEqual(sorted([guest, host]));
	});
});

describe("rendering", () => {
	it("task assigned: deep link, subject and the manage footer", () => {
		const payload = {
			assigneeId: "p1" as Id<"people">,
			taskId: "t1" as Id<"tasks">,
			taskTitle: "Wire it",
		};
		expect(KINDS.taskAssigned.push(payload, recipient("p1"))).toEqual({
			title: "New task assigned",
			body: "Wire it",
			url: "https://j.floor/tasks?task=t1",
			tag: "task-t1",
		});
		const email = KINDS.taskAssigned.email?.(payload, recipient("p1"));
		expect(email?.subject).toBe("You've been assigned a task: Wire it");
		expect(email?.html).toContain("https://j.floor/?notifications=open");
	});

	it("event starting soon names the start time from the zoned value", () => {
		const push = KINDS.eventStartingSoon.push(
			{
				eventId: "e1" as Id<"events">,
				name: "Demo Night",
				startsAtLocal: "2026-10-10T18:00:00+02:00[Europe/Zurich]",
			},
			recipient("p1")
		);
		expect(push).toEqual({
			title: "Demo Night starts soon",
			body: "Starts at 18:00.",
			url: "https://j.floor/events?event=e1",
			tag: "event-e1-start",
		});
	});

	it("guest expiring soon speaks to the guest differently from the host", () => {
		const payload = {
			guestId: "g1" as Id<"people">,
			guestName: "Gus Guest",
			untilDate: "6 October 2026",
		};
		expect(
			KINDS.guestExpiringSoon.push(payload, recipient("g1")).body
		).toBe("Your guest access ends on 6 October 2026.");
		expect(
			KINDS.guestExpiringSoon.push(payload, recipient("b1", "Bo")).body
		).toBe("Gus Guest's guest access ends on 6 October 2026.");
	});

	it("guest upgraded: no email to the guest (they get memberUpgrade), email to the host", () => {
		const payload = {
			guestId: "g1" as Id<"people">,
			guestName: "Gus Guest",
			change: "upgraded" as const,
		};
		expect(
			KINDS.guestAccessChanged.email?.(payload, recipient("g1"))
		).toBeNull();
		expect(
			KINDS.guestAccessChanged.email?.(payload, recipient("h1", "Hal"))
				?.subject
		).toBe("Gus Guest is now a member");
	});

	it("guest window shortened: both guest and host get push and email", () => {
		const payload = {
			guestId: "g1" as Id<"people">,
			guestName: "Gus Guest",
			change: "shortened" as const,
			untilDate: "8 October 2026",
		};
		expect(
			KINDS.guestAccessChanged.push(payload, recipient("g1")).body
		).toBe("Your guest access now ends on 8 October 2026.");
		expect(
			KINDS.guestAccessChanged.push(payload, recipient("h1", "Hal")).body
		).toBe("Gus Guest's guest access now ends on 8 October 2026.");
		expect(
			KINDS.guestAccessChanged.email?.(payload, recipient("g1"))?.subject
		).toBe("Your guest access was shortened");
		expect(
			KINDS.guestAccessChanged.email?.(payload, recipient("h1", "Hal"))
				?.subject
		).toBe("Gus Guest's access was shortened");
	});

	it("door alert links push and email to Space > Diagnostics and carries its tag", () => {
		const payload = {
			headline: "Upstairs lock is offline.",
			detail: "d",
			consequence: "Check the lock.",
			tag: "door-online",
		};
		expect(KINDS.doorAlert.push(payload, recipient("b1"))).toEqual({
			title: "Upstairs lock is offline.",
			body: "Check the lock.",
			url: "https://j.floor/space?tab=diagnostics",
			tag: "door-online",
		});
		const email = KINDS.doorAlert.email?.(payload, recipient("b1"));
		expect(email?.html).toContain(
			'href="https://j.floor/space?tab=diagnostics"'
		);
		expect(email?.text).toContain("https://j.floor/space?tab=diagnostics");
	});

	it("guest links: the guest's own window opens /space, an ended or upgraded one opens /, the host opens the guest", () => {
		const guest = recipient("g1");
		const host = recipient("h1", "Hal");
		const base = { guestId: "g1" as Id<"people">, guestName: "Gus Guest" };
		const guestDrawer = "https://j.floor/community?person=g1";
		const soon = { ...base, untilDate: "6 October 2026" };
		expect(KINDS.guestExpiringSoon.push(soon, guest).url).toBe(
			"https://j.floor/space"
		);
		expect(KINDS.guestExpiringSoon.push(soon, host).url).toBe(guestDrawer);
		expect(KINDS.guestExpiringSoon.email?.(soon, guest)?.html).toContain(
			'href="https://j.floor/space"'
		);
		for (const change of ["extended", "shortened"] as const) {
			const payload = { ...base, change, untilDate: "3 November 2026" };
			expect(
				KINDS.guestAccessChanged.push(payload, guest).url,
				change
			).toBe("https://j.floor/space");
			expect(
				KINDS.guestAccessChanged.push(payload, host).url,
				change
			).toBe(guestDrawer);
			expect(
				KINDS.guestAccessChanged.email?.(payload, guest)?.html,
				change
			).toContain('href="https://j.floor/space"');
		}
		const upgraded = { ...base, change: "upgraded" as const };
		expect(KINDS.guestAccessChanged.push(upgraded, guest).url).toBe(
			"https://j.floor/"
		);
		expect(KINDS.guestAccessChanged.push(upgraded, host).url).toBe(
			guestDrawer
		);
		expect(KINDS.guestExpired.push(base, guest).url).toBe(
			"https://j.floor/"
		);
		expect(KINDS.guestExpired.push(base, host).url).toBe(guestDrawer);
	});
});
