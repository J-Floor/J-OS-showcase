import { ConvexError } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import schema, { tier } from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("getCurrentRole", () => {
	it("returns none when no people row matches", async () => {
		const t = convexTest(schema, modules);
		const role = await t
			.withIdentity({ email: "nobody@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("none");
	});

	it("returns the person's tier for a matching email", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const role = await t
			.withIdentity({ email: "ada@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("board");
	});

	it("returns none when unauthenticated", async () => {
		const t = convexTest(schema, modules);
		const role = await t.query(api.people.getCurrentRole, {});
		expect(role).toBe("none");
	});

	const ACCESS_TIER_NAMES: readonly string[] = [
		"guest",
		"member",
		"core",
		"board",
		"admin",
		"staff",
	];
	const ALL_TIERS = tier.members.map((member) => member.value);
	const ONE_DAY = 24 * 60 * 60 * 1000;

	it.each(
		ALL_TIERS.flatMap((tier) => [
			{ tier, window: "open" as const },
			{ tier, window: "expired" as const },
			{ tier, window: "future" as const },
		])
	)("$tier with a $window window", async ({ tier, window }) => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "tier@example.com",
				firstName: "Tier",
				lastName: "Case",
				tier,
				stage: "active",
				stageSince: now,
				...(window === "future"
					? { accessFrom: now + ONE_DAY }
					: {
							accessUntil:
								window === "open"
									? now + ONE_DAY
									: now - ONE_DAY,
						}),
			})
		);
		const role = await t
			.withIdentity({ email: "tier@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe(
			window === "open" && ACCESS_TIER_NAMES.includes(tier)
				? tier
				: "none"
		);
	});
});

describe("admin has board-level access", () => {
	it("reports its own role as admin", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ops@example.com",
				firstName: "Ops",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const role = await t
			.withIdentity({ email: "ops@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("admin");
	});

	it("passes board-gated guards (listMembers)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ops@example.com",
				firstName: "Ops",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const admin = t.withIdentity({ email: "ops@example.com" });
		// Board-gated query resolves (no throw) and includes the admin itself.
		const members = await admin.query(api.people.listMembers, {});
		expect(members.map((p) => p.email).sort()).toEqual([
			"m@example.com",
			"ops@example.com",
		]);
	});
});

async function seedBoard(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "boss@example.com",
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

function asBoard(t: ReturnType<typeof convexTest>) {
	return t.withIdentity({ email: "boss@example.com" });
}

describe("listMembers / listGuests", () => {
	it("scopes each list and is board-gated", async () => {
		const t = convexTest(schema, modules);
		await seedBoard(t);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const members = await asBoard(t).query(api.people.listMembers, {});
		const guests = await asBoard(t).query(api.people.listGuests, {});
		// listMembers returns members + board (the Members tab groups both); guests
		// are scoped to guest type only.
		expect(members.map((p) => p.email).sort()).toEqual([
			"boss@example.com",
			"m@example.com",
		]);
		expect(guests.map((p) => p.email)).toEqual(["g@example.com"]);
	});

	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "m@example.com" })
				.query(api.people.listMembers, {})
		).rejects.toThrow();
	});
});

describe("kickOut", () => {
	it("moves a member to former, keeps the tier and clears access window", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			await seedBoard(t);
			const pid = await t.run(async (ctx) =>
				ctx.db.insert("people", {
					email: "m@example.com",
					firstName: "M",
					lastName: "",
					tier: "member",
					stage: "active",
					stageSince: Date.now(),
					accessFrom: 1,
					accessUntil: Date.now() + 86_400_000,
				})
			);
			await asBoard(t).mutation(api.people.kickOut, { id: pid });
			const doc = await t.run(async (ctx) => ctx.db.get(pid));
			expect(doc?.tier).toBe("former");
			expect(doc?.formerOf).toBe("member");
			expect(doc?.accessUntil).toBeUndefined();
		});
	});

	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const pid = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "g@example.com" })
				.mutation(api.people.kickOut, { id: pid })
		).rejects.toThrow();
	});
});

describe("upgradeGuestToMember", () => {
	it("upgradeGuestToMember re-opens the agreement instead of just relabelling", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			await seedBoard(t);
			const id = await t.run(async (ctx) => {
				const personId = await ctx.db.insert("people", {
					email: "gia@example.com",
					firstName: "Gia",
					lastName: "Guest",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
					accessUntil: Date.now() + 86_400_000,
					onboarding: { steps: { document: { completedAt: 1 } } },
				});
				await ctx.db.insert("signatures", {
					personId,
					email: "gia@example.com",
					variant: "guest",
					signedName: "Gia Guest",
					agreementVersion: "1",
					agreementHash: "h",
					signedAt: Date.now(),
				});
				return personId;
			});

			await asBoard(t).mutation(api.people.upgradeGuestToMember, { id });

			const person = await t.run(async (ctx) => ctx.db.get(id));
			expect(person?.tier).toBe("member");
			expect(person?.stage).toBe("onboarding");
			expect(person?.onboarding?.steps.document).toBeUndefined();
			expect(person?.accessUntil).toBeUndefined();
		});
	});
});

describe("setGuestAccess", () => {
	it("extends a guest's window through the machine (board caller)", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			await seedBoard(t);
			const pid = await t.run(async (ctx) =>
				ctx.db.insert("people", {
					email: "g@example.com",
					firstName: "G",
					lastName: "",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
				})
			);
			const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
			await asBoard(t).mutation(api.people.setGuestAccess, {
				id: pid,
				expiresAt: expiry,
			});
			const doc = await t.run(async (ctx) => ctx.db.get(pid));
			expect(doc?.stage).toBe("active");
			expect(doc?.accessUntil).toBe(expiry);
		});
	});

	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const pid = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "m@example.com" })
				.mutation(api.people.setGuestAccess, {
					id: pid,
					expiresAt: Date.now() + 1000,
				})
		).rejects.toThrow();
	});
});

describe("listBoardLevel", () => {
	it("returns only board + admin, board-gated", async () => {
		const t = convexTest(schema, modules);
		await seedBoard(t); // boss@example.com (board)
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "admin@example.com",
				firstName: "Ada",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "member@example.com",
				firstName: "Mem",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "staff@example.com",
				firstName: "Sam",
				lastName: "",
				tier: "staff",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const boardLevel = await asBoard(t).query(
			api.people.listBoardLevel,
			{}
		);
		expect(boardLevel.map((p) => p.tier).sort()).toEqual([
			"admin",
			"board",
		]);
		expect(boardLevel.map((p) => p.tier)).not.toContain("staff");
	});

	it("sends a core member only the names, never the rest of the row", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "Hogg",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0100",
				board: { score: 3, noteLog: [{ text: "private", at: 1 }] },
			});
			await ctx.db.insert("people", {
				email: "core@example.com",
				firstName: "Cor",
				lastName: "",
				tier: "core",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const boardLevel = await t
			.withIdentity({ email: "core@example.com" })
			.query(api.people.listBoardLevel, {});
		expect(boardLevel).toHaveLength(1);
		expect(Object.keys(boardLevel[0]).sort()).toEqual([
			"_id",
			"firstName",
			"lastName",
			"tier",
		]);
	});

	it("is forbidden for non-board callers", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "member@example.com",
				firstName: "Mem",
				lastName: "",
				// Correctly tiered (not a bare-`type` row): this must prove a member
				// is refused a board-level list on the ALLOW-LIST check, not just
				// fail early on `tier === undefined` for the wrong reason.
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "member@example.com" })
				.query(api.people.listBoardLevel, {})
		).rejects.toThrow(/Forbidden/);
	});
});

async function seedStaff(t: ReturnType<typeof convexTest>) {
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "staff@example.com",
			firstName: "Sam",
			lastName: "Staff",
			tier: "staff",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: "staff@example.com" });
}

describe("staff access", () => {
	it("staff reads the board contacts and their own row", async () => {
		const t = convexTest(schema, modules);
		const asStaff = await seedStaff(t);
		await expect(
			asStaff.query(api.people.listBoardContacts, {})
		).resolves.toEqual([]);
		await expect(
			asStaff.query(api.people.getCurrentPerson, {})
		).resolves.toMatchObject({ firstName: "Sam" });
		await expect(
			asStaff.query(api.people.getCurrentRole, {})
		).resolves.toBe("staff");
	});

	it("staff is refused events, Wi-Fi and notification prefs", async () => {
		const t = convexTest(schema, modules);
		const asStaff = await seedStaff(t);
		await expect(
			asStaff.query(api.events.listEvents, {})
		).rejects.toThrow();
		await expect(asStaff.query(api.wifi.get, {})).rejects.toThrow();
		await expect(
			asStaff.query(api.notify.prefs.mine, {})
		).rejects.toThrow();
	});

	it("staff shows on the Members tab", async () => {
		const t = convexTest(schema, modules);
		await seedStaff(t);
		await seedBoard(t);
		const rows = await asBoard(t).query(api.people.listMembers, {});
		expect(rows.map((r) => r.tier)).toContain("staff");
	});
});

describe("setLastPath", () => {
	async function seedBoardId(t: ReturnType<typeof convexTest>) {
		return t.run((ctx) =>
			ctx.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
	}

	it("stores a valid module path", async () => {
		const t = convexTest(schema, modules);
		const id = await seedBoardId(t);
		await asBoard(t).mutation(api.people.setLastPath, { path: "/tasks" });
		expect((await t.run((ctx) => ctx.db.get(id)))?.lastPath).toBe("/tasks");
	});

	it("ignores a path that isn't a module route", async () => {
		const t = convexTest(schema, modules);
		const id = await seedBoardId(t);
		await asBoard(t).mutation(api.people.setLastPath, { path: "/bogus" });
		expect(
			(await t.run((ctx) => ctx.db.get(id)))?.lastPath
		).toBeUndefined();
	});
});

describe("setLastPath access", () => {
	it("refuses a former member and stores nothing", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.people.setLastPath, { path: "/tasks" })
		).rejects.toThrow(/Access expired or revoked/);
		expect(
			(await t.run((ctx) => ctx.db.get(id)))?.lastPath
		).toBeUndefined();
	});

	it("stores the path for an onboarding-stage guest", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "G",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		await t
			.withIdentity({ email: "gia@example.com" })
			.mutation(api.people.setLastPath, { path: "/tasks" });
		expect((await t.run((ctx) => ctx.db.get(id)))?.lastPath).toBe("/tasks");
	});
});

describe("listBoardContacts", () => {
	it("returns active board people with phones for a member caller", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0101",
			});
			await ctx.db.insert("people", {
				email: "mem@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const contacts = await t
			.withIdentity({ email: "mem@example.com" })
			.query(api.people.listBoardContacts, {});
		expect(contacts).toEqual([
			{
				firstName: "Ada",
				lastName: "Lovelace",
				phone: "+1 555 0101",
			},
		]);
	});

	it("excludes admins — they share board permissions but are not on the board", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0101",
			});
			await ctx.db.insert("people", {
				email: "adm@example.com",
				firstName: "Addy",
				lastName: "Min",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0102",
			});
			await ctx.db.insert("people", {
				email: "mem@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const contacts = await t
			.withIdentity({ email: "mem@example.com" })
			.query(api.people.listBoardContacts, {});
		expect(contacts).toEqual([
			{
				firstName: "Ada",
				lastName: "Lovelace",
				phone: "+1 555 0101",
			},
		]);
	});

	it("rejects an unauthenticated caller", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.query(api.people.listBoardContacts, {})
		).rejects.toThrow();
	});
});

describe("getAgreementUrl", () => {
	it("returns the legacy sourceUrl for a signed person", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "B",
				lastName: "Oard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			const id = await ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "Gi",
				lastName: "Guest",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("signatures", {
				personId: id,
				email: "g@example.com",
				variant: "member",
				signedName: "Gi Guest",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
				sourceUrl: "https://drive.example/agreement.pdf",
			});
			return id;
		});
		const url = await t
			.withIdentity({ email: "board@example.com" })
			.query(api.people.getAgreementUrl, { personId });
		expect(url).toBe("https://drive.example/agreement.pdf");
	});

	it("returns null when the person has no signature", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "B",
				lastName: "Oard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			return ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "Gi",
				lastName: "Guest",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const url = await t
			.withIdentity({ email: "board@example.com" })
			.query(api.people.getAgreementUrl, { personId });
		expect(url).toBeNull();
	});

	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Ember",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "m@example.com" })
				.query(api.people.getAgreementUrl, { personId })
		).rejects.toThrow();
	});
});

describe("attendedEvents", () => {
	it("skips attendance for a deleted event and returns the survivor", async () => {
		const t = convexTest(schema, modules);
		const { personId, keptEventId, confirmedAt } = await t.run(
			async (ctx) => {
				const boardId = await ctx.db.insert("people", {
					email: "board@example.com",
					firstName: "B",
					lastName: "Oard",
					tier: "board",
					stage: "active",
					stageSince: Date.now(),
				});
				const personId = await ctx.db.insert("people", {
					email: "p@example.com",
					firstName: "P",
					lastName: "Erson",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
				});
				const keptStartsAt = Date.now();
				const keptEndsAt = Date.now();
				const keptEventId = await ctx.db.insert("events", {
					name: "Demo Night",
					startsAt: keptStartsAt,
					startsAtLocal: zonedLocalFromEpoch(
						keptStartsAt,
						SITE_TIMEZONE
					),
					endsAt: keptEndsAt,
					endsAtLocal: zonedLocalFromEpoch(keptEndsAt, SITE_TIMEZONE),
					createdBy: boardId,
					createdAt: Date.now(),
				});
				const deletedStartsAt = Date.now();
				const deletedEndsAt = Date.now();
				const deletedEventId = await ctx.db.insert("events", {
					name: "Cancelled Mixer",
					startsAt: deletedStartsAt,
					startsAtLocal: zonedLocalFromEpoch(
						deletedStartsAt,
						SITE_TIMEZONE
					),
					endsAt: deletedEndsAt,
					endsAtLocal: zonedLocalFromEpoch(
						deletedEndsAt,
						SITE_TIMEZONE
					),
					createdBy: boardId,
					createdAt: Date.now(),
				});
				await ctx.db.delete(deletedEventId);
				const confirmedAt = Date.now();
				await ctx.db.insert("eventAttendance", {
					personId,
					eventId: keptEventId,
					confirmedAt,
				});
				await ctx.db.insert("eventAttendance", {
					personId,
					eventId: deletedEventId,
					confirmedAt: Date.now(),
				});
				return { personId, keptEventId, confirmedAt };
			}
		);

		const rows = await t
			.withIdentity({ email: "board@example.com" })
			.query(api.people.attendedEvents, { personId });

		expect(rows).toEqual([
			{ eventId: keptEventId, name: "Demo Night", confirmedAt },
		]);
	});

	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Ember",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "m@example.com" })
				.query(api.people.attendedEvents, { personId })
		).rejects.toThrow();
	});
});

describe("the machine owns every member and guest write", () => {
	async function board(t: ReturnType<typeof convexTest>) {
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		return t.withIdentity({ email: "board@example.com" });
	}

	it("kickOut moves a member to former and remembers the tier", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			const asBoard = await board(t);
			const id = await t.run(async (ctx) =>
				ctx.db.insert("people", {
					email: "ada@example.com",
					firstName: "Ada",
					lastName: "Lovelace",
					tier: "member",
					stage: "active",
					stageSince: Date.now(),
					accessUntil: Date.now() + 86_400_000,
				})
			);

			await asBoard.mutation(api.people.kickOut, { id });

			const person = await t.run(async (ctx) => ctx.db.get(id));
			expect(person?.tier).toBe("former");
			expect(person?.formerOf).toBe("member");
			expect(person?.formerReason).toBe("kicked");
			expect(person?.accessUntil).toBeUndefined();

			// The old code scheduled the door revoke inline; this
			// mutation instead relies on the machine's own KICK_OUT effect list
			// (`SET_FORMER`, `RECONCILE_DOOR`) to drop the person's lock access.
			// Asserting the job's name and args — not just that the tier flipped —
			// is what would catch `RECONCILE_DOOR` being dropped from that effect
			// list, which would leave a kicked-out member's lock authorization
			// live even though `access()` now denies them.
			const jobs = await t.run((ctx) =>
				ctx.db.system.query("_scheduled_functions").collect()
			);
			expect(jobs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "doorRevoke:revokeUnlessBreakGlass",
						args: [
							{
								personId: id,
								trigger: "lifecycle",
								detail: "KICK_OUT",
							},
						],
					}),
				])
			);
		});
	});

	it("an illegal transition writes nothing — no patch, no audit row, no scheduled effect", async () => {
		// member.active has no PROMOTE_TO_MEMBER edge in the machine (only a
		// guest can be promoted). Dispatching it here must be rejected BEFORE
		// any write — this is what makes `reduce` throwing ahead of the first
		// `ctx.db.patch` actually load-bearing, rather than a comment nobody
		// checks.
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		const before = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			return ctx.db.get(personId);
		});
		const id = before!._id;

		await expect(
			asBoard.mutation(api.people.upgradeGuestToMember, { id })
		).rejects.toThrow(/Illegal transition/);

		const after = await t.run(async (ctx) => ctx.db.get(id));
		expect(after).toEqual(before);

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", id))
				.collect()
		);
		expect(events).toEqual([]);

		const jobs = await t.run((ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual([]);
	});

	it("upgradeGuestToMember re-opens the agreement instead of just relabelling", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			const asBoard = await board(t);
			const id = await t.run(async (ctx) => {
				const personId = await ctx.db.insert("people", {
					email: "gia@example.com",
					firstName: "Gia",
					lastName: "Guest",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
					accessUntil: Date.now() + 86_400_000,
					onboarding: {
						steps: { document: { completedAt: 1 } },
						tourSeen: true,
					},
				});
				await ctx.db.insert("signatures", {
					personId,
					email: "gia@example.com",
					variant: "guest",
					signedName: "Gia Guest",
					agreementVersion: "1",
					agreementHash: "h",
					signedAt: Date.now(),
				});
				return personId;
			});

			await asBoard.mutation(api.people.upgradeGuestToMember, { id });

			const person = await t.run(async (ctx) => ctx.db.get(id));
			expect(person?.tier).toBe("member");
			expect(person?.stage).toBe("onboarding");
			expect(person?.onboarding?.steps.document).toBeUndefined();
			expect(person?.accessUntil).toBeUndefined();
			// The tour never re-runs on a promotion.
			expect(person?.onboarding?.tourSeen).toBe(true);

			// Property: promoting a guest sends the upgrade email (not the fresh
			// approval one) and does not touch the door. Asserting the scheduled
			// job's NAME and ARGS, not just that `personEvents` recorded an
			// "email" row, is what would catch `sendApprovalEmail` being scheduled
			// by mistake — both write the identical `{ meta: "memberUpgrade" }`
			// audit row, so only the job queue tells them apart.
			const jobs = await t.run((ctx) =>
				ctx.db.system.query("_scheduled_functions").collect()
			);
			expect(jobs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "notifications:sendMemberUpgradeEmail",
						args: [{ email: "gia@example.com" }],
					}),
				])
			);
			expect(jobs).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "notifications:sendApprovalEmail",
					}),
				])
			);
			expect(jobs).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "doorRevoke:revokeUnlessBreakGlass",
					}),
				])
			);
		});
	});

	it("listMembers reports the promoted guest's outstanding member agreement", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "gia@example.com",
				variant: "guest",
				signedName: "Gia Guest",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		const rows = await asBoard.query(api.people.listMembers, {});
		const gia = rows.find((r) => r._id === id);
		expect(gia?.status.flags).toContainEqual({
			id: "agreement_missing",
			variant: "member",
		});
		expect(gia?.status.tier).toBe("member");
		expect(gia?.status.stage).toBe("onboarding");
	});

	it("names the board member who suspended a door in the status flag", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		const boardId = await t.run(
			async (ctx) =>
				(
					await ctx.db
						.query("people")
						.withIndex("by_email", (q) =>
							q.eq("email", "board@example.com")
						)
						.unique()
				)?._id
		);
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
				door: {
					override: "force_off",
					reason: "under review",
					byId: boardId,
				},
			})
		);

		const rows = await asBoard.query(api.people.listMembers, {});
		expect(rows.find((r) => r._id === id)?.status.flags).toContainEqual({
			id: "door_suspended",
			actorName: "Bo Ard",
		});
	});

	it("agrees with getAgreementUrl about whether there is a document to open", async () => {
		// The roster decides whether the "view agreement" button is live; the
		// click asks for the URL. They read the same signature through one
		// helper, so they cannot disagree — and the case that would break a
		// second implementation is here: a NEWER signature with no document at
		// all, sitting on top of an older one that has a link. Picking "any
		// signature with a file" would light the button up and then open
		// nothing.
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		const now = Date.now();
		const ids = await t.run(async (ctx) => {
			const withDoc = await ctx.db.insert("people", {
				email: "doc@example.com",
				firstName: "Dee",
				lastName: "Doc",
				tier: "member",
				stage: "active",
				stageSince: now,
			});
			const shadowed = await ctx.db.insert("people", {
				email: "shadow@example.com",
				firstName: "Sam",
				lastName: "Shadow",
				tier: "member",
				stage: "active",
				stageSince: now,
			});
			const base = {
				variant: "member" as const,
				signedName: "x",
				agreementVersion: "1",
				agreementHash: "h",
			};
			await ctx.db.insert("signatures", {
				...base,
				personId: withDoc,
				email: "doc@example.com",
				signedAt: now,
				sourceUrl: "https://drive.example/agreement.pdf",
			});
			// Older one HAS a link…
			await ctx.db.insert("signatures", {
				...base,
				personId: shadowed,
				email: "shadow@example.com",
				signedAt: now - 1000,
				sourceUrl: "https://drive.example/old.pdf",
			});
			// …but the one that counts does not.
			await ctx.db.insert("signatures", {
				...base,
				personId: shadowed,
				email: "shadow@example.com",
				signedAt: now,
			});
			return { withDoc, shadowed };
		});

		const rows = await asBoard.query(api.people.listMembers, {});
		function row(id: Id<"people">) {
			return rows.find((r) => r._id === id);
		}
		expect(row(ids.withDoc)?.hasAgreement).toBe(true);
		expect(row(ids.shadowed)?.hasAgreement).toBe(false);
		expect(
			await asBoard.query(api.people.getAgreementUrl, {
				personId: ids.withDoc,
			})
		).toBe("https://drive.example/agreement.pdf");
		expect(
			await asBoard.query(api.people.getAgreementUrl, {
				personId: ids.shadowed,
			})
		).toBeNull();
	});

	it("keeps expired guests in the Guests tab and former members in the Members tab", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "expired@example.com",
				firstName: "Ex",
				lastName: "Pired",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "exguest@example.com",
				firstName: "Ex",
				lastName: "Guest",
				tier: "former",
				stage: "active",
				formerOf: "guest",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "exmember@example.com",
				firstName: "Ex",
				lastName: "Member",
				tier: "former",
				stage: "active",
				formerOf: "member",
				stageSince: Date.now(),
			});
		});

		const guests = (await asBoard.query(api.people.listGuests, {})).map(
			(r) => r.email
		);
		const members = (await asBoard.query(api.people.listMembers, {})).map(
			(r) => r.email
		);
		expect(guests.sort()).toEqual([
			"exguest@example.com",
			"expired@example.com",
		]);
		expect(members).toContain("exmember@example.com");
		expect(members).not.toContain("exguest@example.com");
	});

	it("completeBoardStep records who did it and clears the open task", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		// `onboarding`, not `active`: board tasks are only open during onboarding
		// (personStatus gates them), which is what stops every settled member and
		// every board row showing a phantom "Add to WhatsApp group" forever.
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				onboarding: { steps: {}, boardSteps: {} },
			})
		);

		const before = await asBoard.query(api.people.listMembers, {});
		expect(
			before.find((r) => r._id === id)?.status.boardTasks
		).toContainEqual({
			id: "whatsapp",
			label: "Add to WhatsApp group",
		});

		await asBoard.mutation(api.people.completeBoardStep, {
			personId: id,
			stepId: "whatsapp",
		});

		const after = await asBoard.query(api.people.listMembers, {});
		expect(after.find((r) => r._id === id)?.status.boardTasks).toEqual([]);

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", id))
				.collect()
		);
		expect(events.at(-1)).toMatchObject({
			kind: "board_task",
			meta: "whatsapp",
		});
	});

	it("completeBoardStep rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		await board(t);
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				onboarding: { steps: {}, boardSteps: {} },
			})
		);

		await expect(
			t
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.people.completeBoardStep, {
					personId: id,
					stepId: "whatsapp",
				})
		).rejects.toThrow(/Forbidden/);

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.onboarding?.boardSteps).toEqual({});
	});

	it("completeBoardStep rejects a step id that isn't one of BOARD_STEPS", async () => {
		// `stepId` is `v.string()`, not a literal union — this guard is the only
		// thing standing between the console and an arbitrary key written into
		// `onboarding.boardSteps`.
		const t = convexTest(schema, modules);
		const asBoard = await board(t);
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				onboarding: { steps: {}, boardSteps: {} },
			})
		);

		await expect(
			asBoard.mutation(api.people.completeBoardStep, {
				personId: id,
				stepId: "not-a-real-step",
			})
		).rejects.toThrow(/Unknown board step/);

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.onboarding?.boardSteps).toEqual({});
	});

	it("setGuestAccess extends the window through the machine", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			const asBoard = await board(t);
			// This guest already did their part before the window lapsed — steps
			// complete, agreement signed — so re-opening the window lands them back
			// in guest.active rather than guest.onboarding (a guest whose onboarding
			// was never finished must NOT be waved into active — see the machine's
			// EXTEND_WINDOW guard on guest.expired).
			const id = await t.run(async (ctx) => {
				const personId = await ctx.db.insert("people", {
					email: "gia@example.com",
					firstName: "Gia",
					lastName: "Guest",
					tier: "guest",
					stage: "expired",
					stageSince: Date.now(),
					accessUntil: Date.now() - 1000,
					onboarding: {
						steps: {
							welcome: { completedAt: 1 },
							document: { completedAt: 1 },
							rules: { completedAt: 1 },
							doorKey: { completedAt: 1 },
							visit: { completedAt: 1 },
						},
					},
				});
				await ctx.db.insert("signatures", {
					personId,
					email: "gia@example.com",
					variant: "guest",
					signedName: "Gia Guest",
					agreementVersion: "1",
					agreementHash: "h",
					signedAt: Date.now(),
				});
				return personId;
			});
			const until = Date.now() + 30 * 86_400_000;

			await asBoard.mutation(api.people.setGuestAccess, {
				id,
				expiresAt: until,
			});

			const person = await t.run(async (ctx) => ctx.db.get(id));
			expect(person?.stage).toBe("active");
			expect(person?.accessUntil).toBe(until);
		});
	});
});

describe("the gates read tier alone", () => {
	it("a kicked-out member loses sign-in", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "ex@example.com",
				firstName: "Ex",
				lastName: "Member",
				tier: "former",
				stage: "active",
				formerOf: "member",
				formerReason: "kicked",
				stageSince: Date.now(),
			});
		});

		expect(
			await t
				.withIdentity({ email: "ex@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("none");
		await expect(
			t
				.withIdentity({ email: "ex@example.com" })
				.query(api.people.getCurrentPerson, {})
		).rejects.toThrow(/Forbidden|Access expired/);
	});

	it("an approved guest can sign in", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			});
		});

		expect(
			await t
				.withIdentity({ email: "gia@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("guest");
	});

	it("an expired guest reads as no role", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Guest",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
			});
		});

		expect(
			await t
				.withIdentity({ email: "gone@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("none");
	});

	it("a door suspension does not take away sign-in", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "sus@example.com",
				firstName: "Sus",
				lastName: "Pended",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
				door: { override: "force_off", reason: "under review" },
			});
		});

		expect(
			await t
				.withIdentity({ email: "sus@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("member");
	});
});

describe("requireRole(ACCESS_TIERS): every sign-in tier is admitted, an expired window is not", () => {
	// `ACCESS_TIERS` is the sign-in allow-list. A negative-only assertion (e.g.
	// "does not contain prospect/former") is satisfied by an empty array, so
	// each tier needs its own positive exercise through the real gate —
	// `getCurrentPerson`, the only query gated on `ACCESS_TIERS` itself.
	for (const accessTier of [
		"guest",
		"member",
		"core",
		"board",
		"admin",
	] as const) {
		it(`admits a correctly-tiered, entitled ${accessTier}`, async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("people", {
					email: `${accessTier}@example.com`,
					firstName: "T",
					lastName: "Ier",
					tier: accessTier,
					stage: "active",
					stageSince: Date.now(),
				});
			});

			const person = await t
				.withIdentity({ email: `${accessTier}@example.com` })
				.query(api.people.getCurrentPerson, {});
			expect(person.email).toBe(`${accessTier}@example.com`);
		});
	}

	it("finds the signed-in person whatever the case of the identity's email", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		const asAda = t.withIdentity({ email: "Ada@Example.COM" });
		expect(await asAda.query(api.people.getCurrentRole, {})).toBe("member");
		const person = await asAda.query(api.people.getCurrentPerson, {});
		expect(person._id).toBe(personId);
	});

	it("refuses a correctly-tiered guest whose access window has expired", async () => {
		// The `entitled` half of `requireRole` is the sole replacement for
		// `accessActive`'s window/revocation enforcement. This row passes the
		// tier check outright (`guest` is in ACCESS_TIERS, stage is `active`) so a
		// rejection here can only come from the window check, not from
		// `tier === undefined` or an unlisted tier — the two ways the OTHER
		// branch already gets pinned elsewhere in this file. The
		// `/Access expired or revoked/` string also belongs to `onboarding.ts`'s
		// unrelated guard, so asserting via `getCurrentPerson` (not onboarding)
		// is what actually pins `requireRole`'s own branch.
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "expired-window@example.com",
				firstName: "Ex",
				lastName: "Pired",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() - 1000,
			});
		});

		await expect(
			t
				.withIdentity({ email: "expired-window@example.com" })
				.query(api.people.getCurrentPerson, {})
		).rejects.toThrow(/Access expired or revoked/);
	});
});

describe("updateOwnProfile", () => {
	async function seedMember(t: ReturnType<typeof convexTest>) {
		return t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "mia@example.com",
				firstName: "Mia",
				lastName: "Chen",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
				phone: "old",
				vertical: ["ai"],
				venture: {
					name: "OldCo",
					description: "old desc",
					whyJoin: "KEEP why",
					pastBuilt: "KEEP past",
					referral: "KEEP ref",
				},
			})
		);
	}

	it("writes only whitelisted fields and preserves locked venture answers", async () => {
		const t = convexTest(schema, modules);
		const id = await seedMember(t);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await runAndCollectLogs(t, () =>
				t
					.withIdentity({ email: "mia@example.com" })
					.mutation(api.people.updateOwnProfile, {
						phone: "new",
						vertical: ["ai", "fintech"],
						ventureName: "NewCo",
						description: "new desc",
						productStage: "mvp",
						fundingStage: "seed",
						teamSize: 3,
						links: [{ label: "", url: "https://x.dev" }],
					})
			);
		} finally {
			warnSpy.mockRestore();
			vi.unstubAllEnvs();
		}
		const row = await t.run(async (ctx) => ctx.db.get(id));
		expect(row?.phone).toBe("new");
		expect(row?.vertical).toEqual(["ai", "fintech"]);
		expect(row?.venture?.name).toBe("NewCo");
		expect(row?.venture?.description).toBe("new desc");
		expect(row?.venture?.productStage).toBe("mvp");
		expect(row?.venture?.fundingStage).toBe("seed");
		expect(row?.venture?.teamSize).toBe(3);
		expect(row?.venture?.links).toEqual([
			{ label: "", url: "https://x.dev/" },
		]);
		// locked venture answers survive the merge
		expect(row?.venture?.whyJoin).toBe("KEEP why");
		expect(row?.venture?.pastBuilt).toBe("KEEP past");
		expect(row?.venture?.referral).toBe("KEEP ref");
		// identity/role untouched
		expect(row?.email).toBe("mia@example.com");
		expect(row?.firstName).toBe("Mia");
		expect(row?.tier).toBe("member");
	});

	it("logs an audit row per changed scalar field", async () => {
		const t = convexTest(schema, modules);
		const id = await seedMember(t);
		await t
			.withIdentity({ email: "mia@example.com" })
			.mutation(api.people.updateOwnProfile, { ventureName: "NewCo" });
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", id))
				.collect()
		);
		expect(
			events.some(
				(e) => e.kind === "field_edit" && e.field === "venture.name"
			)
		).toBe(true);
	});

	it("rejects a javascript: URL in links", async () => {
		const t = convexTest(schema, modules);
		await seedMember(t);
		await expect(
			t
				.withIdentity({ email: "mia@example.com" })
				.mutation(api.people.updateOwnProfile, {
					links: [{ label: "x", url: "javascript:alert(1)" }],
				})
		).rejects.toThrow();
	});

	it("throws for a caller with no person row", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t
				.withIdentity({ email: "ghost@example.com" })
				.mutation(api.people.updateOwnProfile, { phone: "x" })
		).rejects.toThrow();
	});

	it("rejects a prospect (no access tier)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "pro@example.com",
				firstName: "Pro",
				lastName: "Spect",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "pro@example.com" })
				.mutation(api.people.updateOwnProfile, { phone: "x" })
		).rejects.toThrow();
	});
});

describe("logWifiOpen", () => {
	async function seedMember(t: ReturnType<typeof convexTest>) {
		return t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
	}

	it("records the first Wi-Fi open once and is idempotent", async () => {
		const t = convexTest(schema, modules);
		const id = await seedMember(t);
		const asAda = t.withIdentity({ email: "ada@example.com" });

		await asAda.mutation(api.people.logWifiOpen, {});
		await asAda.mutation(api.people.logWifiOpen, {});

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", id))
				.collect()
		);
		expect(events.filter((e) => e.kind === "wifi")).toHaveLength(1);
	});

	it("refuses a former member and writes nothing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		await expect(
			t
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.people.logWifiOpen, {})
		).rejects.toThrow(/Access expired or revoked/);

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.filter((q) => q.eq(q.field("kind"), "wifi"))
				.collect()
		);
		expect(events).toEqual([]);
	});

	it("records the first open for an onboarding-stage guest", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "G",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		await t
			.withIdentity({ email: "gia@example.com" })
			.mutation(api.people.logWifiOpen, {});
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", id))
				.collect()
		);
		expect(events.filter((e) => e.kind === "wifi")).toHaveLength(1);
	});

	it("writes nothing when there is no matching person", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t
				.withIdentity({ email: "ghost@example.com" })
				.mutation(api.people.logWifiOpen, {})
		).rejects.toThrow(/Forbidden/);

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("personEvents")
				.filter((q) => q.eq(q.field("kind"), "wifi"))
				.collect()
		);
		expect(events).toEqual([]);
	});
});

describe("a person's own row never carries board-only data", () => {
	async function seedApplicant(
		t: ReturnType<typeof convexTest>,
		tier: "member" | "prospect"
	) {
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "me@example.com",
				firstName: "Me",
				lastName: "Self",
				tier,
				stage: tier === "member" ? "active" : "denied",
				stageSince: Date.now(),
				door: {
					override: "force_off",
					reason: "board-only reason",
					doorUserId: "provider-1",
				},
				board: {
					score: 2,
					noteLog: [{ text: "board-only note", at: 1 }],
				},
			})
		);
	}

	it("getCurrentPerson strips board notes, score, token and door reason", async () => {
		const t = convexTest(schema, modules);
		await seedApplicant(t, "member");
		const me = await t
			.withIdentity({ email: "me@example.com" })
			.query(api.people.getCurrentPerson, {});
		expect(me).not.toBeNull();
		expect(Object.keys(me).sort()).toEqual([
			"_creationTime",
			"_id",
			"door",
			"email",
			"firstName",
			"lastName",
			"stage",
			"stageSince",
			"tier",
		]);
		expect(me.door).toEqual({ override: "force_off" });
	});

	it("onboarding.getState strips them too, even for an applicant", async () => {
		const t = convexTest(schema, modules);
		await seedApplicant(t, "prospect");
		const state = await t
			.withIdentity({ email: "me@example.com" })
			.query(api.onboarding.getState, {});
		const json = JSON.stringify(state);
		expect(json).not.toContain("board-only");
		expect(json).not.toContain("provider-1");
		expect(state.person).not.toHaveProperty("board");
	});
});

describe("markBoardStepDone", () => {
	it("ticks the step by email, keeps an earlier tick, and reports unknown emails", async () => {
		const t = convexTest(schema, modules);
		const [a, b] = await t.run(async (ctx) => [
			await ctx.db.insert("people", {
				email: "a@example.com",
				firstName: "A",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: 0,
				onboarding: { steps: { welcome: { completedAt: 1 } } },
			}),
			await ctx.db.insert("people", {
				email: "b@example.com",
				firstName: "B",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: 0,
				onboarding: {
					steps: {},
					boardSteps: { whatsapp: { completedAt: 5 } },
				},
			}),
		]);
		const res = await t.mutation(internal.people.markBoardStepDone, {
			stepId: "whatsapp",
			emails: ["a@example.com", "b@example.com", "nobody@example.com"],
		});
		expect(res).toEqual({
			marked: ["a@example.com"],
			alreadyDone: ["b@example.com"],
			unknown: ["nobody@example.com"],
		});
		const [pa, pb] = await t.run(async (ctx) => [
			await ctx.db.get(a),
			await ctx.db.get(b),
		]);
		expect(pa?.onboarding?.steps).toEqual({ welcome: { completedAt: 1 } });
		expect(pa?.onboarding?.boardSteps?.whatsapp).toBeDefined();
		expect(pb?.onboarding?.boardSteps?.whatsapp).toEqual({
			completedAt: 5,
		});
	});

	it("rejects an unknown step", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.people.markBoardStepDone, {
				stepId: "nope",
				emails: [],
			})
		).rejects.toThrow(/Unknown board step/);
	});
});

describe("unmarkBoardStepDone", () => {
	it("clears a CLI tick and its timeline row, but keeps a board member's tick", async () => {
		const t = convexTest(schema, modules);
		const [cli, board] = await t.run(async (ctx) => {
			const boss = await ctx.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: 0,
			});
			return [
				await ctx.db.insert("people", {
					email: "cli@example.com",
					firstName: "C",
					lastName: "",
					tier: "guest",
					stage: "active",
					stageSince: 0,
				}),
				await ctx.db.insert("people", {
					email: "board@example.com",
					firstName: "B",
					lastName: "",
					tier: "member",
					stage: "active",
					stageSince: 0,
					onboarding: {
						steps: {},
						boardSteps: {
							whatsapp: { completedAt: 5, byId: boss },
						},
					},
				}),
			];
		});
		await t.mutation(internal.people.markBoardStepDone, {
			stepId: "whatsapp",
			emails: ["cli@example.com"],
		});
		const res = await t.mutation(internal.people.unmarkBoardStepDone, {
			stepId: "whatsapp",
			emails: [
				"cli@example.com",
				"board@example.com",
				"nobody@example.com",
			],
		});
		expect(res).toEqual({
			unmarked: ["cli@example.com"],
			notDone: [],
			keptByBoard: ["board@example.com"],
			unknown: ["nobody@example.com"],
		});
		const [c, b, events] = await t.run(async (ctx) => [
			await ctx.db.get(cli),
			await ctx.db.get(board),
			await ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", cli))
				.collect(),
		]);
		expect(c?.onboarding?.boardSteps).toEqual({});
		expect(b?.onboarding?.boardSteps?.whatsapp.completedAt).toBe(5);
		expect(events).toEqual([]);
	});
});

describe("addDirect", () => {
	async function stateOfEmail(t: TestConvex<typeof schema>, email: string) {
		return t.run(async (ctx) => {
			const p = await ctx.db
				.query("people")
				.withIndex("by_email", (q) => q.eq("email", email))
				.unique();
			return p && `${p.tier}.${p.stage}`;
		});
	}

	it("a new email lands as staff.active, audited", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			const id = await t.mutation(internal.people.addDirect, {
				email: " Hedy@Example.com ",
				firstName: "Hedy",
				lastName: "Lamarr",
				tier: "staff",
			});
			expect(await stateOfEmail(t, "hedy@example.com")).toBe(
				"staff.active"
			);
			const events = await t.run((ctx) =>
				ctx.db
					.query("personEvents")
					.withIndex("by_person", (q) => q.eq("personId", id))
					.collect()
			);
			expect(events.some((e) => e.to === "staff.active")).toBe(true);
		});
	});

	it("an existing member moves to staff", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			await t.run((ctx) =>
				ctx.db.insert("people", {
					email: "m@example.com",
					firstName: "M",
					lastName: "X",
					tier: "member",
					stage: "active",
					stageSince: 0,
					provenance: "seed",
					door: { override: "none" },
				})
			);
			await t.mutation(internal.people.addDirect, {
				email: "M@example.com",
				firstName: "M",
				lastName: "X",
				tier: "staff",
			});
			expect(await stateOfEmail(t, "m@example.com")).toBe("staff.active");
		});
	});

	it("a new member without an agreement lands in onboarding", async () => {
		const t = convexTest(schema, modules);
		await runAndCollectLogs(t, async () => {
			await t.mutation(internal.people.addDirect, {
				email: "new@example.com",
				firstName: "N",
				lastName: "X",
				tier: "member",
			});
			expect(await stateOfEmail(t, "new@example.com")).toBe(
				"member.onboarding"
			);
		});
	});

	it("an existing visitor is refused with the state they are in", async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "v@example.com",
				firstName: "V",
				lastName: "X",
				tier: "visitor",
				stage: "verified",
				stageSince: 0,
				verifiedAt: 0,
			})
		);
		const refusal: unknown = await t
			.mutation(internal.people.addDirect, {
				email: "v@example.com",
				firstName: "V",
				lastName: "X",
				tier: "staff",
			})
			.catch((err: unknown) => err);
		expect(refusal).toBeInstanceOf(ConvexError);
		expect((refusal as ConvexError<string>).data).toMatch(
			/visitor\.verified/
		);
		expect(await stateOfEmail(t, "v@example.com")).toBe("visitor.verified");
	});

	it("an invalid email is refused", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.people.addDirect, {
				email: "not-an-email",
				firstName: "N",
				lastName: "X",
				tier: "staff",
			})
		).rejects.toThrow();
	});
});

describe("input length caps", () => {
	async function seedMiaAndBoard(t: ReturnType<typeof convexTest>) {
		await seedBoard(t);
		return t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "mia2@example.com",
				firstName: "Mia",
				lastName: "Chen",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
	}

	it("updateOwnProfile rejects an over-long phone, venture name and description", async () => {
		const t = convexTest(schema, modules);
		await seedMiaAndBoard(t);
		const asMia = t.withIdentity({ email: "mia2@example.com" });
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				phone: "1".repeat(51),
			})
		).rejects.toThrow("Phone is too long (max 50 characters).");
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				ventureName: "v".repeat(301),
			})
		).rejects.toThrow("Venture name is too long (max 300 characters).");
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				description: "d".repeat(5001),
			})
		).rejects.toThrow("Description is too long (max 5000 characters).");
	});

	it("the board update rejects over-long text fields", async () => {
		const t = convexTest(schema, modules);
		const id = await seedMiaAndBoard(t);
		const cases: [Record<string, string>, string][] = [
			[
				{ phone: "1".repeat(51) },
				"Phone is too long (max 50 characters).",
			],
			[
				{ ventureName: "v".repeat(301) },
				"Venture name is too long (max 300 characters).",
			],
			[
				{ description: "d".repeat(5001) },
				"Description is too long (max 5000 characters).",
			],
			[
				{ whyJoin: "w".repeat(5001) },
				"Why join is too long (max 5000 characters).",
			],
			[
				{ pastBuilt: "p".repeat(5001) },
				"Past built is too long (max 5000 characters).",
			],
			[
				{ referral: "r".repeat(321) },
				"Referral is too long (max 320 characters).",
			],
		];
		for (const [fields, message] of cases) {
			await expect(
				asBoard(t).mutation(api.people.update, { id, ...fields })
			).rejects.toThrow(message);
		}
	});

	it("addNote rejects an over-long note", async () => {
		const t = convexTest(schema, modules);
		const id = await seedMiaAndBoard(t);
		await expect(
			asBoard(t).mutation(api.people.addNote, {
				id,
				text: "n".repeat(5001),
			})
		).rejects.toThrow("Note is too long (max 5000 characters).");
	});
});
