import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { runAndCollectLogs } from "../../test-stubs/runAndCollectLogs.ts";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { NINETY_DAYS } from "../lib/constants.ts";
import schema from "../schema.ts";

import { appPath, MARK_ALL_BATCH, PURGE_BATCH } from "./inbox.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const NOW = Date.now();
const DAY = 86_400_000;

type T = ReturnType<typeof convexTest>;

async function seedPerson(
	backend: T,
	email: string,
	tier: "member" | "former" = "member"
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
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
	backend: T,
	personId: Id<"people">,
	count: number,
	options: { at?: number; readAt?: number; title?: string } = {}
): Promise<Id<"notifications">[]> {
	const at = options.at ?? NOW;
	const title = options.title ?? "row";
	return backend.run(async (context) => {
		const ids: Id<"notifications">[] = [];
		for (let index = 0; index < count; index++) {
			ids.push(
				await context.db.insert("notifications", {
					personId,
					kind: "taskAssigned",
					title: `${title} ${String(index)}`,
					body: "Wire it",
					url: "/tasks",
					createdAt: at - index,
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
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const bob = await seedPerson(backend, "bob@jfloor.test");
		const message = {
			title: "Upstairs lock is offline.",
			body: "Check the lock.",
			url: "/space?tab=diagnostics",
		};

		await backend.mutation(internal.notify.inbox.record, {
			kind: "doorAlert",
			rows: [
				{ personId: ada, ...message },
				{ personId: bob, ...message },
			],
		});

		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		// eslint-disable-next-line id-length -- conventional comparator parameter names
		const expectedIds = [ada, bob].sort((a, b) => a.localeCompare(b));
		const gotIds = rows
			.map((row) => row.personId)
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => a.localeCompare(b));
		expect(gotIds).toEqual(expectedIds);
		for (const row of rows) {
			expect(row).toMatchObject({ kind: "doorAlert", ...message });
			expect(row.readAt).toBeUndefined();
		}
		expect(new Set(rows.map((row) => row.createdAt)).size).toBe(1);
	});
});

describe("reading the history", () => {
	it("pages a 120-row history newest first, 50 at a time, without gaps or repeats", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const bob = await seedPerson(backend, "bob@jfloor.test");
		await seedRows(backend, ada, 120, { title: "ada" });
		await seedRows(backend, bob, 5, { title: "bob" });
		const asAda = backend.withIdentity({ email: "ada@jfloor.test" });

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
		expect(all.map((row) => row.createdAt)).toEqual(
			Array.from({ length: 120 }, (_, index) => NOW - index)
		);
		expect(new Set(all.map((row) => row._id)).size).toBe(120);
		expect(all.every((row) => row.title.startsWith("ada "))).toBe(true);
	});

	it("rows sharing the floor's createdAt all land in the head, none dropped or repeated below", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const floorAt = NOW - 49;
		await seedRows(backend, ada, 49, { title: "above" });
		for (let index = 0; index < 4; index++)
			await seedRows(backend, ada, 1, { at: floorAt, title: "tie" });
		await seedRows(backend, ada, 10, { at: floorAt - 1, title: "below" });
		const asAda = backend.withIdentity({ email: "ada@jfloor.test" });

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

		expect(head.filter((row) => row.createdAt === floorAt)).toHaveLength(4);
		expect(older.page.every((row) => row.createdAt < floorAt)).toBe(true);
		const all = [...head, ...older.page];
		expect(all).toHaveLength(63);
		expect(new Set(all.map((row) => row._id)).size).toBe(63);
	});

	it("a history of 50 or fewer has no floor and comes back whole, as InboxRows", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		await seedRows(backend, ada, 2, { title: "ada" });
		const asAda = backend.withIdentity({ email: "ada@jfloor.test" });

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
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const bob = await seedPerson(backend, "bob@jfloor.test");
		await seedRows(backend, ada, 2);
		await seedRows(backend, ada, 3, { at: NOW - 10, readAt: NOW });
		await seedRows(backend, bob, 150);

		expect(
			await backend
				.withIdentity({ email: "ada@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(2);
		expect(
			await backend
				.withIdentity({ email: "bob@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(100);
	});
});

describe("read state", () => {
	it("markRead marks the caller's own row read", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const [id] = await seedRows(backend, ada, 1);
		const asAda = backend.withIdentity({ email: "ada@jfloor.test" });

		await asAda.mutation(api.notify.inbox.markRead, { id });

		const row = await backend.run((context) => context.db.get(id));
		expect(row?.readAt).toBeTypeOf("number");
		expect(await asAda.query(api.notify.inbox.unreadCount, {})).toBe(0);
		const [first] = await asAda.query(api.notify.inbox.listSince, {
			since: null,
		});
		expect(first.read).toBe(true);
	});

	it("markRead keeps an existing readAt", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const [id] = await seedRows(backend, ada, 1, { readAt: NOW - 1000 });

		await backend
			.withIdentity({ email: "ada@jfloor.test" })
			.mutation(api.notify.inbox.markRead, { id });

		const row = await backend.run((context) => context.db.get(id));
		expect(row?.readAt).toBe(NOW - 1000);
	});

	it("markRead refuses another person's row", async () => {
		const backend = convexTest(schema, modules);
		await seedPerson(backend, "ada@jfloor.test");
		const bob = await seedPerson(backend, "bob@jfloor.test");
		const [id] = await seedRows(backend, bob, 1);

		await expect(
			backend
				.withIdentity({ email: "ada@jfloor.test" })
				.mutation(api.notify.inbox.markRead, { id })
		).rejects.toThrow(/Forbidden/);
		const row = await backend.run((context) => context.db.get(id));
		expect(row?.readAt).toBeUndefined();
	});

	it("markRead on a row that is gone throws NotificationNotFound", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const [id] = await seedRows(backend, ada, 1);
		await backend.run((context) => context.db.delete(id));

		await expect(
			backend
				.withIdentity({ email: "ada@jfloor.test" })
				.mutation(api.notify.inbox.markRead, { id })
		).rejects.toThrow(/NotificationNotFound/);
	});

	it("markAllRead clears more than one batch through its scheduled continuation, and only the caller's", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		const bob = await seedPerson(backend, "bob@jfloor.test");
		await seedRows(backend, ada, MARK_ALL_BATCH + 1);
		await seedRows(backend, bob, 1);
		const asAda = backend.withIdentity({ email: "ada@jfloor.test" });

		await runAndCollectLogs(backend, () =>
			asAda.mutation(api.notify.inbox.markAllRead, {})
		);

		expect(await asAda.query(api.notify.inbox.unreadCount, {})).toBe(0);
		expect(
			await backend
				.withIdentity({ email: "bob@jfloor.test" })
				.query(api.notify.inbox.unreadCount, {})
		).toBe(1);
	});
});

describe("access", () => {
	it("every public function rejects a caller outside the community tiers", async () => {
		const backend = convexTest(schema, modules);
		const former = await seedPerson(
			backend,
			"former@jfloor.test",
			"former"
		);
		const [id] = await seedRows(backend, former, 1);
		const asFormer = backend.withIdentity({ email: "former@jfloor.test" });

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
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		await seedRows(backend, ada, PURGE_BATCH + 1, {
			at: NOW - NINETY_DAYS - DAY,
			title: "old",
		});
		await seedRows(backend, ada, 1, {
			at: NOW - NINETY_DAYS + DAY,
			title: "kept",
		});

		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.notify.inbox.purgeExpired, {})
		);

		const left = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(left.map((row) => row.title)).toEqual(["kept 0"]);
	});

	it("reports how many rows one run deleted", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@jfloor.test");
		await seedRows(backend, ada, 2, { at: NOW - NINETY_DAYS - DAY });

		expect(
			await backend.mutation(internal.notify.inbox.purgeExpired, {})
		).toEqual({ deleted: 2 });
	});
});
