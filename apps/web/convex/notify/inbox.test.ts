import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { runAndCollectLogs } from "../../test-stubs/runAndCollectLogs.ts";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema.ts";

import { appPath, MARK_ALL_BATCH, NINETY_DAYS, PURGE_BATCH } from "./inbox.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const NOW = Date.now();
const DAY = 86_400_000;

type T = ReturnType<typeof convexTest>;

async function seedPerson(
	t: T,
	email: string,
	tier: "member" | "former" = "member"
): Promise<Id<"people">> {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email,
			firstName: email.split("@")[0],
			lastName: "X",
			tier,
			stage: "active",
			stageSince: NOW,
		})
	);
}

/** `count` rows for one person, newest first from `at`, one millisecond apart. */
async function seedRows(
	t: T,
	personId: Id<"people">,
	count: number,
	options: { at?: number; readAt?: number; title?: string } = {}
): Promise<Id<"notifications">[]> {
	const at = options.at ?? NOW;
	const title = options.title ?? "row";
	return t.run(async (ctx) => {
		const ids: Id<"notifications">[] = [];
		for (let i = 0; i < count; i++) {
			ids.push(
				await ctx.db.insert("notifications", {
					personId,
					kind: "taskAssigned",
					title: `${title} ${String(i)}`,
					body: "Wire it",
					url: "/tasks",
					createdAt: at - i,
					readAt: options.readAt,
				})
			);
		}
		return ids;
	});
}

describe("appPath", () => {
	it("keeps the path, query and hash of an absolute URL", () => {
		expect(appPath("https://j.floor/space?tab=diagnostics#lock")).toBe(
			"/space?tab=diagnostics#lock"
		);
		expect(appPath("https://j.floor/")).toBe("/");
	});

	it("stores / for a URL that does not parse", () => {
		expect(appPath("/tasks?task=t1")).toBe("/");
		expect(appPath("")).toBe("/");
	});
});

describe("record", () => {
	it("writes one unread row per entry, all with one createdAt", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const bob = await seedPerson(t, "bob@jfloor.test");
		const message = {
			title: "Upstairs lock is offline.",
			body: "Check the lock.",
			url: "/space?tab=diagnostics",
		};

		await t.mutation(internal.notify.inbox.record, {
			kind: "doorAlert",
			rows: [
				{ personId: ada, ...message },
				{ personId: bob, ...message },
			],
		});

		const rows = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(rows.map((r) => r.personId).sort()).toEqual([ada, bob].sort());
		for (const row of rows) {
			expect(row).toMatchObject({ kind: "doorAlert", ...message });
			expect(row.readAt).toBeUndefined();
		}
		expect(new Set(rows.map((r) => r.createdAt)).size).toBe(1);
	});
});

describe("reading the history", () => {
	it("pages a 120-row history newest first, 50 at a time, without gaps or repeats", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const bob = await seedPerson(t, "bob@jfloor.test");
		await seedRows(t, ada, 120, { title: "ada" });
		await seedRows(t, bob, 5, { title: "bob" });
		const asAda = t.withIdentity({ email: "ada@jfloor.test" });

		const { since } = await asAda.query(
			api.notify.inbox.firstPageFloor,
			{}
		);
		if (since === null) throw new Error("expected a floor");
		expect(since).toBe(NOW - 49);
		const head = await asAda.query(api.notify.inbox.listSince, { since });
		const first = await asAda.query(api.notify.inbox.listBefore, {
			before: since,
			paginationOpts: { numItems: 50, cursor: null },
		});
		const second = await asAda.query(api.notify.inbox.listBefore, {
			before: since,
			paginationOpts: { numItems: 50, cursor: first.continueCursor },
		});

		expect(head).toHaveLength(50);
		expect(first.page).toHaveLength(50);
		expect(second.page).toHaveLength(20);
		expect(second.isDone).toBe(true);
		const all = [...head, ...first.page, ...second.page];
		expect(all.map((r) => r.createdAt)).toEqual(
			Array.from({ length: 120 }, (_, i) => NOW - i)
		);
		expect(new Set(all.map((r) => r._id)).size).toBe(120);
		expect(all.every((r) => r.title.startsWith("ada "))).toBe(true);
	});

	it("rows sharing the floor's createdAt all land in the head, none dropped or repeated below", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const floorAt = NOW - 49;
		await seedRows(t, ada, 49, { title: "above" });
		for (let i = 0; i < 4; i++)
			await seedRows(t, ada, 1, { at: floorAt, title: "tie" });
		await seedRows(t, ada, 10, { at: floorAt - 1, title: "below" });
		const asAda = t.withIdentity({ email: "ada@jfloor.test" });

		const { since } = await asAda.query(
			api.notify.inbox.firstPageFloor,
			{}
		);
		expect(since).toBe(floorAt);
		if (since === null) throw new Error("expected a floor");
		const head = await asAda.query(api.notify.inbox.listSince, { since });
		const older = await asAda.query(api.notify.inbox.listBefore, {
			before: since,
			paginationOpts: { numItems: 50, cursor: null },
		});

		expect(head.filter((r) => r.createdAt === floorAt)).toHaveLength(4);
		expect(older.page.every((r) => r.createdAt < floorAt)).toBe(true);
		const all = [...head, ...older.page];
		expect(all).toHaveLength(63);
		expect(new Set(all.map((r) => r._id)).size).toBe(63);
	});

	it("a history of 50 or fewer has no floor and comes back whole, as InboxRows", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		await seedRows(t, ada, 2, { title: "ada" });
		const asAda = t.withIdentity({ email: "ada@jfloor.test" });

		expect(await asAda.query(api.notify.inbox.firstPageFloor, {})).toEqual({
			since: null,
		});
		const rows = await asAda.query(api.notify.inbox.listSince, {
			since: null,
		});
		expect(rows).toEqual([
			{
				_id: expect.any(String) as string,
				title: "ada 0",
				body: "Wire it",
				url: "/tasks",
				createdAt: NOW,
				read: false,
			},
			{
				_id: expect.any(String) as string,
				title: "ada 1",
				body: "Wire it",
				url: "/tasks",
				createdAt: NOW - 1,
				read: false,
			},
		]);
	});

	it("unreadCount counts only the caller's unread rows and stops reading past the cap", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const bob = await seedPerson(t, "bob@jfloor.test");
		await seedRows(t, ada, 2);
		await seedRows(t, ada, 3, { at: NOW - 10, readAt: NOW });
		await seedRows(t, bob, 150);

		expect(
			await t
				.withIdentity({ email: "ada@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(2);
		expect(
			await t
				.withIdentity({ email: "bob@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(100);
	});
});

describe("read state", () => {
	it("markRead marks the caller's own row read", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const [id] = await seedRows(t, ada, 1);
		const asAda = t.withIdentity({ email: "ada@jfloor.test" });

		await asAda.mutation(api.notify.inbox.markRead, { id });

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.readAt).toBeTypeOf("number");
		expect(await asAda.query(api.notify.inbox.unreadCount, {})).toBe(0);
		expect(
			(await asAda.query(api.notify.inbox.listSince, { since: null }))[0]
				.read
		).toBe(true);
	});

	it("markRead keeps an existing readAt", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const [id] = await seedRows(t, ada, 1, { readAt: NOW - 1000 });

		await t
			.withIdentity({ email: "ada@jfloor.test" })
			.mutation(api.notify.inbox.markRead, { id });

		expect((await t.run((ctx) => ctx.db.get(id)))?.readAt).toBe(NOW - 1000);
	});

	it("markRead refuses another person's row", async () => {
		const t = convexTest(schema, modules);
		await seedPerson(t, "ada@jfloor.test");
		const bob = await seedPerson(t, "bob@jfloor.test");
		const [id] = await seedRows(t, bob, 1);

		await expect(
			t
				.withIdentity({ email: "ada@jfloor.test" })
				.mutation(api.notify.inbox.markRead, { id })
		).rejects.toThrow(/Forbidden/);
		expect((await t.run((ctx) => ctx.db.get(id)))?.readAt).toBeUndefined();
	});

	it("markRead on a row that is gone throws Not found", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const [id] = await seedRows(t, ada, 1);
		await t.run((ctx) => ctx.db.delete(id));

		await expect(
			t
				.withIdentity({ email: "ada@jfloor.test" })
				.mutation(api.notify.inbox.markRead, { id })
		).rejects.toThrow(/Not found/);
	});

	it("markAllRead clears more than one batch through its scheduled continuation, and only the caller's", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		const bob = await seedPerson(t, "bob@jfloor.test");
		await seedRows(t, ada, MARK_ALL_BATCH + 1);
		await seedRows(t, bob, 1);
		const asAda = t.withIdentity({ email: "ada@jfloor.test" });

		await runAndCollectLogs(t, () =>
			asAda.mutation(api.notify.inbox.markAllRead, {})
		);

		expect(await asAda.query(api.notify.inbox.unreadCount, {})).toBe(0);
		expect(
			await t
				.withIdentity({ email: "bob@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(1);
	});
});

describe("access", () => {
	it("every public function rejects a caller outside the community tiers", async () => {
		const t = convexTest(schema, modules);
		const former = await seedPerson(t, "former@jfloor.test", "former");
		const [id] = await seedRows(t, former, 1);
		const asFormer = t.withIdentity({ email: "former@jfloor.test" });

		// Thunks, not promises: each call starts only when awaited, so no
		// rejection goes unhandled while an earlier one is checked.
		const calls: (() => Promise<unknown>)[] = [
			() => asFormer.query(api.notify.inbox.firstPageFloor, {}),
			() => asFormer.query(api.notify.inbox.listSince, { since: null }),
			() =>
				asFormer.query(api.notify.inbox.listBefore, {
					before: NOW,
					paginationOpts: { numItems: 50, cursor: null },
				}),
			() => asFormer.query(api.notify.inbox.unreadCount, {}),
			() => asFormer.mutation(api.notify.inbox.markRead, { id }),
			() => asFormer.mutation(api.notify.inbox.markAllRead, {}),
		];
		for (const call of calls)
			await expect(call()).rejects.toThrow(/Forbidden/);
	});
});

describe("purgeExpired", () => {
	it("deletes rows older than 90 days across more than one batch and keeps newer ones", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		await seedRows(t, ada, PURGE_BATCH + 1, {
			at: NOW - NINETY_DAYS - DAY,
			title: "old",
		});
		await seedRows(t, ada, 1, {
			at: NOW - NINETY_DAYS + DAY,
			title: "kept",
		});

		await runAndCollectLogs(t, () =>
			t.mutation(internal.notify.inbox.purgeExpired, {})
		);

		const left = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(left.map((r) => r.title)).toEqual(["kept 0"]);
	});

	it("reports how many rows one run deleted", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test");
		await seedRows(t, ada, 2, { at: NOW - NINETY_DAYS - DAY });

		expect(
			await t.mutation(internal.notify.inbox.purgeExpired, {})
		).toEqual({ deleted: 2 });
	});
});
