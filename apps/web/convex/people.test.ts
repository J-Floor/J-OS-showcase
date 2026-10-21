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
		const backend = convexTest(schema, modules);
		const role = await backend
			.withIdentity({ email: "nobody@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("none");
	});

	it("returns the person's tier for a matching email", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const role = await backend
			.withIdentity({ email: "ada@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("board");
	});

	it("returns none when unauthenticated", async () => {
		const backend = convexTest(schema, modules);
		const role = await backend.query(api.people.getCurrentRole, {});
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
		const backend = convexTest(schema, modules);
		const now = Date.now();
		await backend.run(async (context) =>
			context.db.insert("people", {
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
		const role = await backend
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
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ops@example.com",
				firstName: "Ops",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const role = await backend
			.withIdentity({ email: "ops@example.com" })
			.query(api.people.getCurrentRole, {});
		expect(role).toBe("admin");
	});

	it("passes board-gated guards (listMembers)", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ops@example.com",
				firstName: "Ops",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const admin = backend.withIdentity({ email: "ops@example.com" });
		// Board-gated query resolves (no throw) and includes the admin itself.
		const members = await admin.query(api.people.listMembers, {});
		expect(
			members
				.map((person) => person.email)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual(["m@example.com", "ops@example.com"]);
	});
});

async function seedBoard(backend: ReturnType<typeof convexTest>) {
	await backend.run(async (context) =>
		context.db.insert("people", {
			email: "boss@example.com",
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

function asBoard(backend: ReturnType<typeof convexTest>) {
	return backend.withIdentity({ email: "boss@example.com" });
}

describe("listGuests agreement from signedVariants", () => {
	it("reads hasAgreement and status off the person, not signatures", async () => {
		const backend = convexTest(schema, modules);
		await seedBoard(backend);
		await backend.run(async (context) => {
			for (const [email, signedVariants] of [
				["signed@example.com", ["guest"] as const],
				["unsigned@example.com", undefined],
			] as const)
				await context.db.insert("people", {
					email,
					firstName: email,
					lastName: "",
					tier: "guest",
					stage: "onboarding",
					stageSince: Date.now(),
					signedVariants: signedVariants
						? [...signedVariants]
						: undefined,
				});
		});
		const guests = await asBoard(backend).query(api.people.listGuests, {});
		const signed = guests.find(
			(guest) => guest.email === "signed@example.com"
		);
		const unsigned = guests.find(
			(guest) => guest.email === "unsigned@example.com"
		);
		expect(signed?.hasAgreement).toBe(true);
		expect(unsigned?.hasAgreement).toBe(false);
		function missing(guest: typeof signed) {
			return guest?.status.flags.some(
				(flag) => flag.id === "agreement_missing"
			);
		}
		expect(missing(signed)).toBe(false);
		expect(missing(unsigned)).toBe(true);
	});
});

describe("listMembers / listGuests", () => {
	it("scopes each list and is board-gated", async () => {
		const backend = convexTest(schema, modules);
		await seedBoard(backend);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const members = await asBoard(backend).query(
			api.people.listMembers,
			{}
		);
		const guests = await asBoard(backend).query(api.people.listGuests, {});
		// listMembers returns members + board (the Members tab groups both); guests
		// are scoped to guest type only.
		expect(
			members
				.map((person) => person.email)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual(["boss@example.com", "m@example.com"]);
		expect(guests.map((guest) => guest.email)).toEqual(["g@example.com"]);
	});

	it("rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "m@example.com" })
				.query(api.people.listMembers, {})
		).rejects.toThrow();
	});
});

describe("roster former split", () => {
	it("keeps each former person on the tab of the tier they left", async () => {
		const backend = convexTest(schema, modules);
		await seedBoard(backend);
		const now = Date.now();
		function former(
			email: string,
			formerOf?: "guest" | "member" | "staff"
		) {
			return {
				email,
				firstName: "F",
				lastName: "",
				tier: "former" as const,
				stage: "expired" as const,
				stageSince: now,
				...(formerOf === undefined ? {} : { formerOf }),
			};
		}
		await backend.run(async (context) => {
			await context.db.insert(
				"people",
				former("fg@example.com", "guest")
			);
			await context.db.insert(
				"people",
				former("fm@example.com", "member")
			);
			await context.db.insert(
				"people",
				former("fs@example.com", "staff")
			);
			await context.db.insert("people", former("fn@example.com"));
		});
		const members = await asBoard(backend).query(
			api.people.listMembers,
			{}
		);
		const guests = await asBoard(backend).query(api.people.listGuests, {});
		expect(guests.map((guest) => guest.email)).toEqual(["fg@example.com"]);
		expect(
			members
				.map((person) => person.email)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual([
			"boss@example.com",
			"fm@example.com",
			"fn@example.com",
			"fs@example.com",
		]);
	});
});

describe("kickOut", () => {
	it("moves a member to former, keeps the tier and clears access window", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			await seedBoard(backend);
			const pid = await backend.run(async (context) =>
				context.db.insert("people", {
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
			await asBoard(backend).mutation(api.people.kickOut, { id: pid });
			const doc = await backend.run(async (context) =>
				context.db.get(pid)
			);
			expect(doc?.tier).toBe("former");
			expect(doc?.formerOf).toBe("member");
			expect(doc?.accessUntil).toBeUndefined();
		});
	});

	it("rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const pid = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "g@example.com" })
				.mutation(api.people.kickOut, { id: pid })
		).rejects.toThrow();
	});
});

describe("upgradeGuestToMember", () => {
	it("upgradeGuestToMember re-opens the agreement instead of just relabelling", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			await seedBoard(backend);
			const id = await backend.run(async (context) => {
				const personId = await context.db.insert("people", {
					email: "gia@example.com",
					firstName: "Gia",
					lastName: "Guest",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
					accessUntil: Date.now() + 86_400_000,
					onboarding: { steps: { document: { completedAt: 1 } } },
				});
				await context.db.insert("signatures", {
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

			await asBoard(backend).mutation(api.people.upgradeGuestToMember, {
				id,
			});

			const person = await backend.run(async (context) =>
				context.db.get(id)
			);
			expect(person?.tier).toBe("member");
			expect(person?.stage).toBe("onboarding");
			expect(person?.onboarding?.steps.document).toBeUndefined();
			expect(person?.accessUntil).toBeUndefined();
		});
	});
});

describe("setGuestAccess", () => {
	it("extends a guest's window through the machine (board caller)", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			await seedBoard(backend);
			const pid = await backend.run(async (context) =>
				context.db.insert("people", {
					email: "g@example.com",
					firstName: "G",
					lastName: "",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
				})
			);
			const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
			await asBoard(backend).mutation(api.people.setGuestAccess, {
				id: pid,
				expiresAt: expiry,
			});
			const doc = await backend.run(async (context) =>
				context.db.get(pid)
			);
			expect(doc?.stage).toBe("active");
			expect(doc?.accessUntil).toBe(expiry);
		});
	});

	it("rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const pid = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
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
		const backend = convexTest(schema, modules);
		await seedBoard(backend); // boss@example.com (board)
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "admin@example.com",
				firstName: "Ada",
				lastName: "",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "member@example.com",
				firstName: "Mem",
				lastName: "",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "staff@example.com",
				firstName: "Sam",
				lastName: "",
				tier: "staff",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const boardLevel = await asBoard(backend).query(
			api.people.listBoardLevel,
			{}
		);
		expect(
			boardLevel
				.map((person) => person.tier)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual(["admin", "board"]);
		expect(boardLevel.map((person) => person.tier)).not.toContain("staff");
	});

	it("sends a core member only the names, never the rest of the row", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "Hogg",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0100",
				board: { score: 3, noteLog: [{ text: "private", at: 1 }] },
			});
			await context.db.insert("people", {
				email: "core@example.com",
				firstName: "Cor",
				lastName: "",
				tier: "core",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const boardLevel = await backend
			.withIdentity({ email: "core@example.com" })
			.query(api.people.listBoardLevel, {});
		expect(boardLevel).toHaveLength(1);
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			Object.keys(boardLevel[0]).sort((a, b) => a.localeCompare(b))
		).toEqual(["_id", "firstName", "lastName", "tier"]);
	});

	it("is forbidden for non-board callers", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
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
			backend
				.withIdentity({ email: "member@example.com" })
				.query(api.people.listBoardLevel, {})
		).rejects.toThrow(/Forbidden/);
	});
});

async function seedStaff(backend: ReturnType<typeof convexTest>) {
	await backend.run((context) =>
		context.db.insert("people", {
			email: "staff@example.com",
			firstName: "Sam",
			lastName: "Staff",
			tier: "staff",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend.withIdentity({ email: "staff@example.com" });
}

describe("staff access", () => {
	it("staff reads the board contacts and their own row", async () => {
		const backend = convexTest(schema, modules);
		const asStaff = await seedStaff(backend);
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
		const backend = convexTest(schema, modules);
		const asStaff = await seedStaff(backend);
		await expect(
			asStaff.query(api.events.listEvents, {})
		).rejects.toThrow();
		await expect(asStaff.query(api.wifi.get, {})).rejects.toThrow();
		await expect(
			asStaff.query(api.notify.prefs.mine, {})
		).rejects.toThrow();
	});

	it("staff shows on the Members tab", async () => {
		const backend = convexTest(schema, modules);
		await seedStaff(backend);
		await seedBoard(backend);
		const rows = await asBoard(backend).query(api.people.listMembers, {});
		expect(rows.map((row) => row.tier)).toContain("staff");
	});
});

async function storedPath(
	backend: TestConvex<typeof schema>,
	id: Id<"people">
) {
	return backend.run(async (context) => {
		const state = await context.db
			.query("personState")
			.withIndex("by_person", (range) => range.eq("personId", id))
			.first();
		return state?.lastPath ?? null;
	});
}

async function seedBoardId(backend: ReturnType<typeof convexTest>) {
	return backend.run((context) =>
		context.db.insert("people", {
			email: "boss@example.com",
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

describe("setLastPath", () => {
	it("stores a valid module path in personState, not on people", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedBoardId(backend);
		const before = await backend.run((context) => context.db.get(id));
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/tasks",
		});
		expect(await storedPath(backend, id)).toBe("/tasks");
		expect(await backend.run((context) => context.db.get(id))).toEqual(
			before
		);
	});

	it("updates the one personState row on a new path", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedBoardId(backend);
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/tasks",
		});
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/community",
		});
		expect(await storedPath(backend, id)).toBe("/community");
		const rows = await backend.run((context) =>
			context.db.query("personState").collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("skips the write when the path is unchanged", async () => {
		const backend = convexTest(schema, modules);
		await seedBoardId(backend);
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/tasks",
		});
		const [first] = await backend.run((context) =>
			context.db.query("personState").collect()
		);
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/tasks",
		});
		const [second] = await backend.run((context) =>
			context.db.query("personState").collect()
		);
		expect(second).toEqual(first);
	});

	it("ignores a path that isn't a module route", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedBoardId(backend);
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/bogus",
		});
		expect(await storedPath(backend, id)).toBeNull();
	});
});

describe("getLastPath", () => {
	it("returns null with no stored path", async () => {
		const backend = convexTest(schema, modules);
		await seedBoard(backend);
		expect(
			await asBoard(backend).query(api.people.getLastPath, {})
		).toBeNull();
	});

	it("returns null for a caller with no person row", async () => {
		const backend = convexTest(schema, modules);
		expect(
			await backend
				.withIdentity({ email: "nobody@example.com" })
				.query(api.people.getLastPath, {})
		).toBeNull();
	});

	it("returns the stored path", async () => {
		const backend = convexTest(schema, modules);
		await seedBoard(backend);
		await asBoard(backend).mutation(api.people.setLastPath, {
			path: "/tasks",
		});
		expect(await asBoard(backend).query(api.people.getLastPath, {})).toBe(
			"/tasks"
		);
	});
});

describe("setLastPath access", () => {
	it("refuses a former member and stores nothing", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.people.setLastPath, { path: "/tasks" })
		).rejects.toThrow(/AccessExpired/);
		expect(await storedPath(backend, id)).toBeNull();
	});

	it("stores the path for an onboarding-stage guest", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "G",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		await backend
			.withIdentity({ email: "gia@example.com" })
			.mutation(api.people.setLastPath, { path: "/tasks" });
		expect(await storedPath(backend, id)).toBe("/tasks");
	});
});

describe("listBoardContacts", () => {
	it("returns active board people with phones for a member caller", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0101",
			});
			await context.db.insert("people", {
				email: "mem@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const contacts = await backend
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
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0101",
			});
			await context.db.insert("people", {
				email: "adm@example.com",
				firstName: "Addy",
				lastName: "Min",
				tier: "admin",
				stage: "active",
				stageSince: Date.now(),
				phone: "+1 555 0102",
			});
			await context.db.insert("people", {
				email: "mem@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const contacts = await backend
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
		const backend = convexTest(schema, modules);
		await expect(
			backend.query(api.people.listBoardContacts, {})
		).rejects.toThrow();
	});
});

describe("getAgreementUrl", () => {
	it("returns the legacy sourceUrl for a signed person", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "board@example.com",
				firstName: "B",
				lastName: "Oard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			const id = await context.db.insert("people", {
				email: "g@example.com",
				firstName: "Gi",
				lastName: "Guest",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("signatures", {
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
		const url = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.people.getAgreementUrl, { personId });
		expect(url).toBe("https://drive.example/agreement.pdf");
	});

	it("returns null when the person has no signature", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "board@example.com",
				firstName: "B",
				lastName: "Oard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			return context.db.insert("people", {
				email: "g@example.com",
				firstName: "Gi",
				lastName: "Guest",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		const url = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.people.getAgreementUrl, { personId });
		expect(url).toBeNull();
	});

	it("rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Ember",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "m@example.com" })
				.query(api.people.getAgreementUrl, { personId })
		).rejects.toThrow();
	});
});

describe("attendedEvents", () => {
	it("skips attendance for a deleted event and returns the survivor", async () => {
		const backend = convexTest(schema, modules);
		const { personId, keptEventId, confirmedAt } = await backend.run(
			async (context) => {
				const boardId = await context.db.insert("people", {
					email: "board@example.com",
					firstName: "B",
					lastName: "Oard",
					tier: "board",
					stage: "active",
					stageSince: Date.now(),
				});
				const personId = await context.db.insert("people", {
					email: "p@example.com",
					firstName: "P",
					lastName: "Erson",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
				});
				const keptStartsAt = Date.now();
				const keptEndsAt = Date.now();
				const keptEventId = await context.db.insert("events", {
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
				const deletedEventId = await context.db.insert("events", {
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
				await context.db.delete(deletedEventId);
				const confirmedAt = Date.now();
				await context.db.insert("eventAttendance", {
					personId,
					eventId: keptEventId,
					confirmedAt,
				});
				await context.db.insert("eventAttendance", {
					personId,
					eventId: deletedEventId,
					confirmedAt: Date.now(),
				});
				return { personId, keptEventId, confirmedAt };
			}
		);

		const rows = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.people.attendedEvents, { personId });

		expect(rows).toEqual([
			{ eventId: keptEventId, name: "Demo Night", confirmedAt },
		]);
	});

	it("rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Ember",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "m@example.com" })
				.query(api.people.attendedEvents, { personId })
		).rejects.toThrow();
	});
});

async function boardTester(backend: ReturnType<typeof convexTest>) {
	await backend.run(async (context) =>
		context.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend.withIdentity({ email: "board@example.com" });
}

describe("the machine owns every member and guest write", () => {
	it("kickOut moves a member to former and remembers the tier", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			const asBoard = await boardTester(backend);
			const id = await backend.run(async (context) =>
				context.db.insert("people", {
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

			const person = await backend.run(async (context) =>
				context.db.get(id)
			);
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
			const jobs = await backend.run((context) =>
				context.db.system.query("_scheduled_functions").collect()
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
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		const before = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			return context.db.get(personId);
		});
		const id = before!._id;

		await expect(
			asBoard.mutation(api.people.upgradeGuestToMember, { id })
		).rejects.toThrow(/IllegalTransition/);

		const after = await backend.run(async (context) => context.db.get(id));
		expect(after).toEqual(before);

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events).toEqual([]);

		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual([]);
	});

	it("upgradeGuestToMember re-opens the agreement instead of just relabelling", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			const asBoard = await boardTester(backend);
			const id = await backend.run(async (context) => {
				const personId = await context.db.insert("people", {
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
				await context.db.insert("signatures", {
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

			const person = await backend.run(async (context) =>
				context.db.get(id)
			);
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
			const jobs = await backend.run((context) =>
				context.db.system.query("_scheduled_functions").collect()
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
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		const id = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				signedVariants: ["guest"],
			});
			await context.db.insert("signatures", {
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
		const gia = rows.find((row) => row._id === id);
		expect(gia?.status.flags).toContainEqual({
			id: "agreement_missing",
			variant: "member",
		});
		expect(gia?.status.tier).toBe("member");
		expect(gia?.status.stage).toBe("onboarding");
	});

	it("names the board member who suspended a door in the status flag", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		const boardId = await backend.run(async (context) => {
			const board = await context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "board@example.com")
				)
				.unique();
			return board?._id;
		});
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
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
		expect(rows.find((row) => row._id === id)?.status.flags).toContainEqual(
			{
				id: "door_suspended",
				actorName: "Bo Ard",
			}
		);
	});

	it("agrees with getAgreementUrl about whether there is a document to open", async () => {
		// The roster decides whether the "view agreement" button is live; the
		// click asks for the URL. recordSignature refuses a signature with
		// neither a file nor a link, so "signed a variant" and "has a document
		// to open" cannot disagree.
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		const now = Date.now();
		const ids = await backend.run(async (context) => {
			const withDoc = await context.db.insert("people", {
				email: "doc@example.com",
				firstName: "Dee",
				lastName: "Doc",
				tier: "member",
				stage: "active",
				stageSince: now,
				signedVariants: ["member"],
			});
			const base = {
				variant: "member" as const,
				signedName: "x",
				agreementVersion: "1",
				agreementHash: "h",
			};
			await context.db.insert("signatures", {
				...base,
				personId: withDoc,
				email: "doc@example.com",
				signedAt: now,
				sourceUrl: "https://drive.example/agreement.pdf",
			});
			return { withDoc };
		});

		const rows = await asBoard.query(api.people.listMembers, {});
		function row(id: Id<"people">) {
			return rows.find((candidate) => candidate._id === id);
		}
		expect(row(ids.withDoc)?.hasAgreement).toBe(true);
		expect(
			await asBoard.query(api.people.getAgreementUrl, {
				personId: ids.withDoc,
			})
		).toBe("https://drive.example/agreement.pdf");
	});

	it("keeps expired guests in the Guests tab and former members in the Members tab", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "expired@example.com",
				firstName: "Ex",
				lastName: "Pired",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "exguest@example.com",
				firstName: "Ex",
				lastName: "Guest",
				tier: "former",
				stage: "active",
				formerOf: "guest",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "exmember@example.com",
				firstName: "Ex",
				lastName: "Member",
				tier: "former",
				stage: "active",
				formerOf: "member",
				stageSince: Date.now(),
			});
		});

		const guestRows = await asBoard.query(api.people.listGuests, {});
		const memberRows = await asBoard.query(api.people.listMembers, {});
		const guests = guestRows.map((row) => row.email);
		const members = memberRows.map((row) => row.email);
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			guests.toSorted((a, b) => a.localeCompare(b))
		).toEqual(["exguest@example.com", "expired@example.com"]);
		expect(members).toContain("exmember@example.com");
		expect(members).not.toContain("exguest@example.com");
	});

	it("completeBoardStep records who did it and clears the open task", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		// `onboarding`, not `active`: board tasks are only open during onboarding
		// (personStatus gates them), which is what stops every settled member and
		// every board row showing a phantom "Add to WhatsApp group" forever.
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
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
			before.find((row) => row._id === id)?.status.boardTasks
		).toContainEqual({
			id: "whatsapp",
			label: "Add to WhatsApp group",
		});

		await asBoard.mutation(api.people.completeBoardStep, {
			personId: id,
			stepId: "whatsapp",
		});

		const after = await asBoard.query(api.people.listMembers, {});
		expect(after.find((row) => row._id === id)?.status.boardTasks).toEqual(
			[]
		);

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events.at(-1)).toMatchObject({
			kind: "board_task",
			meta: "whatsapp",
		});
	});

	it("completeBoardStep rejects a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		await boardTester(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
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
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.people.completeBoardStep, {
					personId: id,
					stepId: "whatsapp",
				})
		).rejects.toThrow(/Forbidden/);

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.onboarding?.boardSteps).toEqual({});
	});

	it("completeBoardStep rejects a step id that isn't one of BOARD_STEPS", async () => {
		// `stepId` is `v.string()`, not a literal union — this guard is the only
		// thing standing between the console and an arbitrary key written into
		// `onboarding.boardSteps`.
		const backend = convexTest(schema, modules);
		const asBoard = await boardTester(backend);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
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

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.onboarding?.boardSteps).toEqual({});
	});

	it("setGuestAccess extends the window through the machine", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			const asBoard = await boardTester(backend);
			// This guest already did their part before the window lapsed — steps
			// complete, agreement signed — so re-opening the window lands them back
			// in guest.active rather than guest.onboarding (a guest whose onboarding
			// was never finished must NOT be waved into active — see the machine's
			// EXTEND_WINDOW guard on guest.expired).
			const id = await backend.run(async (context) => {
				const personId = await context.db.insert("people", {
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
				await context.db.insert("signatures", {
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

			const person = await backend.run(async (context) =>
				context.db.get(id)
			);
			expect(person?.stage).toBe("active");
			expect(person?.accessUntil).toBe(until);
		});
	});
});

describe("the gates read tier alone", () => {
	it("a kicked-out member loses sign-in", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
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
			await backend
				.withIdentity({ email: "ex@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("none");
		await expect(
			backend
				.withIdentity({ email: "ex@example.com" })
				.query(api.people.getCurrentPerson, {})
		).rejects.toThrow(/Forbidden|Access expired/);
	});

	it("an approved guest can sign in", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			});
		});

		expect(
			await backend
				.withIdentity({ email: "gia@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("guest");
	});

	it("an expired guest reads as no role", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Guest",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
			});
		});

		expect(
			await backend
				.withIdentity({ email: "gone@example.com" })
				.query(api.people.getCurrentRole, {})
		).toBe("none");
	});

	it("a door suspension does not take away sign-in", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
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
			await backend
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
			const backend = convexTest(schema, modules);
			await backend.run(async (context) => {
				await context.db.insert("people", {
					email: `${accessTier}@example.com`,
					firstName: "T",
					lastName: "Ier",
					tier: accessTier,
					stage: "active",
					stageSince: Date.now(),
				});
			});

			const person = await backend
				.withIdentity({ email: `${accessTier}@example.com` })
				.query(api.people.getCurrentPerson, {});
			expect(person.email).toBe(`${accessTier}@example.com`);
		});
	}

	it("finds the signed-in person whatever the case of the identity's email", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		const asAda = backend.withIdentity({ email: "Ada@Example.COM" });
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
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
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
			backend
				.withIdentity({ email: "expired-window@example.com" })
				.query(api.people.getCurrentPerson, {})
		).rejects.toThrow(/AccessExpired/);
	});
});

async function seedOwnProfileMember(backend: ReturnType<typeof convexTest>) {
	return backend.run(async (context) =>
		context.db.insert("people", {
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

describe("updateOwnProfile", () => {
	it("writes only whitelisted fields and preserves locked venture answers", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedOwnProfileMember(backend);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await runAndCollectLogs(backend, () =>
				backend
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
		const row = await backend.run(async (context) => context.db.get(id));
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
		const backend = convexTest(schema, modules);
		const id = await seedOwnProfileMember(backend);
		await backend
			.withIdentity({ email: "mia@example.com" })
			.mutation(api.people.updateOwnProfile, { ventureName: "NewCo" });
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(
			events.some(
				(event) =>
					event.kind === "field_edit" &&
					event.field === "venture.name"
			)
		).toBe(true);
	});

	it("rejects a javascript: URL in links", async () => {
		const backend = convexTest(schema, modules);
		await seedOwnProfileMember(backend);
		await expect(
			backend
				.withIdentity({ email: "mia@example.com" })
				.mutation(api.people.updateOwnProfile, {
					links: [{ label: "x", url: "javascript:alert(1)" }],
				})
		).rejects.toThrow();
	});

	it("throws for a caller with no person row", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend
				.withIdentity({ email: "ghost@example.com" })
				.mutation(api.people.updateOwnProfile, { phone: "x" })
		).rejects.toThrow();
	});

	it("rejects a prospect (no access tier)", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "pro@example.com",
				firstName: "Pro",
				lastName: "Spect",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "pro@example.com" })
				.mutation(api.people.updateOwnProfile, { phone: "x" })
		).rejects.toThrow();
	});
});

async function seedWifiMember(backend: ReturnType<typeof convexTest>) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

describe("logWifiOpen", () => {
	it("records the first Wi-Fi open once and is idempotent", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedWifiMember(backend);
		const asAda = backend.withIdentity({ email: "ada@example.com" });

		await asAda.mutation(api.people.logWifiOpen, {});
		await asAda.mutation(api.people.logWifiOpen, {});

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events.filter((event) => event.kind === "wifi")).toHaveLength(1);
	});

	it("refuses a former member and writes nothing", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.people.logWifiOpen, {})
		).rejects.toThrow(/AccessExpired/);

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.filter((expression) =>
					expression.eq(expression.field("kind"), "wifi")
				)
				.collect()
		);
		expect(events).toEqual([]);
	});

	it("records the first open for an onboarding-stage guest", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "G",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		await backend
			.withIdentity({ email: "gia@example.com" })
			.mutation(api.people.logWifiOpen, {});
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events.filter((event) => event.kind === "wifi")).toHaveLength(1);
	});

	it("writes nothing when there is no matching person", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend
				.withIdentity({ email: "ghost@example.com" })
				.mutation(api.people.logWifiOpen, {})
		).rejects.toThrow(/Forbidden/);

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.filter((expression) =>
					expression.eq(expression.field("kind"), "wifi")
				)
				.collect()
		);
		expect(events).toEqual([]);
	});
});

async function seedApplicant(
	backend: ReturnType<typeof convexTest>,
	tier: "member" | "prospect"
) {
	await backend.run((context) =>
		context.db.insert("people", {
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

describe("a person's own row never carries board-only data", () => {
	it("getCurrentPerson strips board notes, score, token and door reason", async () => {
		const backend = convexTest(schema, modules);
		await seedApplicant(backend, "member");
		const me = await backend
			.withIdentity({ email: "me@example.com" })
			.query(api.people.getCurrentPerson, {});
		expect(me).not.toBeNull();
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			Object.keys(me).sort((a, b) => a.localeCompare(b))
		).toEqual([
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
		const backend = convexTest(schema, modules);
		await seedApplicant(backend, "prospect");
		const state = await backend
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
		const backend = convexTest(schema, modules);
		const [firstId, secondId] = await backend.run(async (context) => [
			await context.db.insert("people", {
				email: "a@example.com",
				firstName: "A",
				lastName: "",
				tier: "guest",
				stage: "active",
				stageSince: 0,
				onboarding: { steps: { welcome: { completedAt: 1 } } },
			}),
			await context.db.insert("people", {
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
		const result = await backend.mutation(
			internal.people.markBoardStepDone,
			{
				stepId: "whatsapp",
				emails: [
					"a@example.com",
					"b@example.com",
					"nobody@example.com",
				],
			}
		);
		expect(result).toEqual({
			marked: ["a@example.com"],
			alreadyDone: ["b@example.com"],
			unknown: ["nobody@example.com"],
		});
		const [pa, pb] = await backend.run(async (context) => [
			await context.db.get(firstId),
			await context.db.get(secondId),
		]);
		expect(pa?.onboarding?.steps).toEqual({ welcome: { completedAt: 1 } });
		expect(pa?.onboarding?.boardSteps?.whatsapp).toBeDefined();
		expect(pb?.onboarding?.boardSteps?.whatsapp).toEqual({
			completedAt: 5,
		});
	});

	it("rejects an unknown step", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.people.markBoardStepDone, {
				stepId: "nope",
				emails: [],
			})
		).rejects.toThrow(/Unknown board step/);
	});
});

describe("unmarkBoardStepDone", () => {
	it("clears a CLI tick and its timeline row, but keeps a board member's tick", async () => {
		const backend = convexTest(schema, modules);
		const [cli, board] = await backend.run(async (context) => {
			const boss = await context.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: 0,
			});
			return [
				await context.db.insert("people", {
					email: "cli@example.com",
					firstName: "C",
					lastName: "",
					tier: "guest",
					stage: "active",
					stageSince: 0,
				}),
				await context.db.insert("people", {
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
		await backend.mutation(internal.people.markBoardStepDone, {
			stepId: "whatsapp",
			emails: ["cli@example.com"],
		});
		const result = await backend.mutation(
			internal.people.unmarkBoardStepDone,
			{
				stepId: "whatsapp",
				emails: [
					"cli@example.com",
					"board@example.com",
					"nobody@example.com",
				],
			}
		);
		expect(result).toEqual({
			unmarked: ["cli@example.com"],
			notDone: [],
			keptByBoard: ["board@example.com"],
			unknown: ["nobody@example.com"],
		});
		const [cliRow, boardRow, events] = await backend.run(
			async (context) => [
				await context.db.get(cli),
				await context.db.get(board),
				await context.db
					.query("personEvents")
					.withIndex("by_person", (range) =>
						range.eq("personId", cli)
					)
					.collect(),
			]
		);
		expect(cliRow?.onboarding?.boardSteps).toEqual({});
		expect(boardRow?.onboarding?.boardSteps?.whatsapp.completedAt).toBe(5);
		expect(events).toEqual([]);
	});
});

async function stateOfEmail(backend: TestConvex<typeof schema>, email: string) {
	return backend.run(async (context) => {
		const person = await context.db
			.query("people")
			.withIndex("by_email", (range) => range.eq("email", email))
			.unique();
		return person && `${person.tier}.${person.stage}`;
	});
}

describe("addDirect", () => {
	it("a new email lands as staff.active, audited", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			const id = await backend.mutation(internal.people.addDirect, {
				email: " Hedy@Example.com ",
				firstName: "Hedy",
				lastName: "Lamarr",
				tier: "staff",
			});
			expect(await stateOfEmail(backend, "hedy@example.com")).toBe(
				"staff.active"
			);
			const events = await backend.run((context) =>
				context.db
					.query("personEvents")
					.withIndex("by_person", (range) => range.eq("personId", id))
					.collect()
			);
			expect(events.some((event) => event.to === "staff.active")).toBe(
				true
			);
		});
	});

	it("an existing member moves to staff", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			await backend.run((context) =>
				context.db.insert("people", {
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
			await backend.mutation(internal.people.addDirect, {
				email: "M@example.com",
				firstName: "M",
				lastName: "X",
				tier: "staff",
			});
			expect(await stateOfEmail(backend, "m@example.com")).toBe(
				"staff.active"
			);
		});
	});

	it("a new member without an agreement lands in onboarding", async () => {
		const backend = convexTest(schema, modules);
		await runAndCollectLogs(backend, async () => {
			await backend.mutation(internal.people.addDirect, {
				email: "new@example.com",
				firstName: "N",
				lastName: "X",
				tier: "member",
			});
			expect(await stateOfEmail(backend, "new@example.com")).toBe(
				"member.onboarding"
			);
		});
	});

	it("an existing visitor is refused with the state they are in", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "v@example.com",
				firstName: "V",
				lastName: "X",
				tier: "visitor",
				stage: "verified",
				stageSince: 0,
				verifiedAt: 0,
			})
		);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let refusal: unknown;
		try {
			refusal = await backend
				.mutation(internal.people.addDirect, {
					email: "v@example.com",
					firstName: "V",
					lastName: "X",
					tier: "staff",
				})
				.catch((err: unknown) => err);
			// The operator sees which transition was refused; the client does not.
			expect(
				warn.mock.calls.some(
					([line]) =>
						String(line).includes("IllegalTransition") &&
						String(line).includes("visitor.verified") &&
						String(line).includes("SET_ROLE")
				)
			).toBe(true);
		} finally {
			warn.mockRestore();
		}
		expect(refusal).toBeInstanceOf(ConvexError);
		expect((refusal as ConvexError<{ code: string }>).data.code).toBe(
			"IllegalTransition"
		);
		expect(await stateOfEmail(backend, "v@example.com")).toBe(
			"visitor.verified"
		);
	});

	it("an invalid email is refused", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.mutation(internal.people.addDirect, {
				email: "not-an-email",
				firstName: "N",
				lastName: "X",
				tier: "staff",
			})
		).rejects.toThrow(/InvalidEmail/);
	});
});

async function seedMiaAndBoard(backend: ReturnType<typeof convexTest>) {
	await seedBoard(backend);
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "mia2@example.com",
			firstName: "Mia",
			lastName: "Chen",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

describe("input length caps", () => {
	it("updateOwnProfile rejects an over-long phone, venture name and description", async () => {
		const backend = convexTest(schema, modules);
		await seedMiaAndBoard(backend);
		const asMia = backend.withIdentity({ email: "mia2@example.com" });
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				phone: "1".repeat(51),
			})
		).rejects.toThrow(/FieldTooLong/);
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				ventureName: "v".repeat(301),
			})
		).rejects.toThrow(/FieldTooLong/);
		await expect(
			asMia.mutation(api.people.updateOwnProfile, {
				description: "d".repeat(5001),
			})
		).rejects.toThrow(/FieldTooLong/);
	});

	it("the board update rejects over-long text fields", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedMiaAndBoard(backend);
		const cases: [Record<string, string>, RegExp][] = [
			[{ phone: "1".repeat(51) }, /FieldTooLong/],
			[{ ventureName: "v".repeat(301) }, /FieldTooLong/],
			[{ description: "d".repeat(5001) }, /FieldTooLong/],
			[{ whyJoin: "w".repeat(5001) }, /FieldTooLong/],
			[{ pastBuilt: "p".repeat(5001) }, /FieldTooLong/],
			[{ referral: "r".repeat(321) }, /FieldTooLong/],
		];
		for (const [fields, message] of cases) {
			await expect(
				asBoard(backend).mutation(api.people.update, { id, ...fields })
			).rejects.toThrow(message);
		}
	});

	it("addNote rejects an over-long note", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedMiaAndBoard(backend);
		await expect(
			asBoard(backend).mutation(api.people.addNote, {
				id,
				text: "n".repeat(5001),
			})
		).rejects.toThrow(/FieldTooLong/);
	});
});
