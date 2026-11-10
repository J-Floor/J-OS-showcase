import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	installFakeEmailProvider,
	type FakeEmailProvider,
} from "../../test-stubs/fakeEmailProvider.ts";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { DAY_MS } from "../lib/constants.ts";
import { setEmailProviderForTests } from "../lib/emailProvider.ts";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");

type T = ReturnType<typeof convexTest>;
type Tier = "member" | "board" | "guest" | "staff";

const NOW = Date.now();
const ONE_SECOND = 1000;
const HOUR = 60 * 60 * 1000;

let provider: FakeEmailProvider;

beforeEach(() => {
	provider = installFakeEmailProvider();
	vi.stubEnv("SITE_URL", "https://app.example.com");
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	setEmailProviderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function seedPerson(
	backend: T,
	email: string,
	tier: Tier = "member",
	extra: { accessUntil?: number; digestCursor?: number } = {},
	notificationPrefs?: { perkUpdates: { push: boolean; email: boolean } }
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: email.split("@")[0],
			lastName: "X",
			tier,
			stage: "active",
			stageSince: NOW - DAY_MS * 30,
			notificationPrefs,
			...extra,
		})
	);
}

async function seedRow(
	backend: T,
	personId: Id<"people">,
	row: {
		kind?: string;
		title: string;
		url?: string;
		createdAt?: number;
		readAt?: number;
	}
): Promise<void> {
	await backend.run((context) =>
		context.db.insert("notifications", {
			personId,
			kind: row.kind ?? "perkAdded",
			title: row.title,
			body: `${row.title} body`,
			url: row.url ?? "/perks?perk=p1",
			createdAt: row.createdAt ?? NOW - ONE_SECOND,
			readAt: row.readAt,
		})
	);
}

async function cursorOf(
	backend: T,
	personId: Id<"people">
): Promise<number | undefined> {
	const person = (await backend.run((context) =>
		context.db.get(personId)
	)) as Doc<"people"> | null;
	return person?.digestCursor;
}

function runDigest(backend: T) {
	return backend.action(internal.notify.digest.send, {});
}

describe("daily digest", () => {
	it("sends one email with the digest rows only, linking to the app", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, { title: "Perk added title" });
		await seedRow(backend, ada, {
			kind: "perkExpiringSoon",
			title: "Perk ending title",
			url: "/perks?perk=p2",
		});
		await seedRow(backend, ada, {
			kind: "guestExpired",
			title: "Guest expired title",
		});

		await runDigest(backend);

		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].to).toBe("ada@example.com");
		expect(provider.sent[0].html).toContain("Perk added title");
		expect(provider.sent[0].html).toContain("Perk ending title");
		expect(provider.sent[0].html).not.toContain("Guest expired title");
		expect(provider.sent[0].html).toContain(
			"https://app.example.com/perks?perk=p1"
		);
		expect(provider.sent[0].html).not.toContain("com//perks");
	});

	it("gives each person only their own rows", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		const bob = await seedPerson(backend, "bob@example.com");
		await seedRow(backend, ada, { title: "Ada only item" });
		await seedRow(backend, bob, { title: "Bob only item" });

		await runDigest(backend);

		expect(provider.sent).toHaveLength(2);
		const toAda = provider.sent.find(
			(email) => email.to === "ada@example.com"
		);
		const toBob = provider.sent.find(
			(email) => email.to === "bob@example.com"
		);
		expect(toAda?.html).toContain("Ada only item");
		expect(toAda?.html).not.toContain("Bob only item");
		expect(toBob?.html).toContain("Bob only item");
		expect(toBob?.html).not.toContain("Ada only item");
	});

	it("skips a row that was already read and moves the cursor past it", async () => {
		const backend = convexTest(schema, modules);
		const createdAt = NOW - ONE_SECOND;
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, {
			title: "Read item",
			createdAt,
			readAt: NOW,
		});

		await runDigest(backend);

		expect(provider.sent).toHaveLength(0);
		expect(await cursorOf(backend, ada)).toBe(createdAt);
	});

	it("leaves out a category the person turned email off for", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(
			backend,
			"ada@example.com",
			"member",
			{},
			{ perkUpdates: { push: true, email: false } }
		);
		await seedRow(backend, ada, { title: "Perk item" });
		await seedRow(backend, ada, {
			kind: "taskAssigned",
			title: "Task item",
			url: "/tasks?task=t1",
		});

		await runDigest(backend);

		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].html).toContain("Task item");
		expect(provider.sent[0].html).not.toContain("Perk item");
	});

	it("sends a guest whose window closed nothing and moves their cursor past their rows", async () => {
		const backend = convexTest(schema, modules);
		const createdAt = NOW - ONE_SECOND;
		const guest = await seedPerson(backend, "gus@example.com", "guest", {
			accessUntil: NOW - DAY_MS,
		});
		await seedRow(backend, guest, { title: "Guest item", createdAt });

		await runDigest(backend);

		expect(provider.sent).toHaveLength(0);
		expect(await cursorOf(backend, guest)).toBe(createdAt);
	});

	it("never includes staff", async () => {
		const backend = convexTest(schema, modules);
		const staff = await seedPerson(backend, "sam@example.com", "staff");
		await seedRow(backend, staff, { title: "Staff item" });

		await runDigest(backend);

		expect(provider.sent).toHaveLength(0);
	});

	it("sends board before members", async () => {
		const backend = convexTest(schema, modules);
		const member = await seedPerson(backend, "mem@example.com", "member");
		const board = await seedPerson(backend, "boa@example.com", "board");
		await seedRow(backend, member, { title: "Member item" });
		await seedRow(backend, board, { title: "Board item" });

		await runDigest(backend);

		expect(provider.sent.map((email) => email.to)).toEqual([
			"boa@example.com",
			"mem@example.com",
		]);
	});

	it("moves the cursor to the newest included row and sends nothing twice", async () => {
		const backend = convexTest(schema, modules);
		const older = NOW - 3 * ONE_SECOND;
		const newer = NOW - 2 * ONE_SECOND;
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, { title: "Older item", createdAt: older });
		await seedRow(backend, ada, { title: "Newer item", createdAt: newer });

		await runDigest(backend);
		expect(await cursorOf(backend, ada)).toBe(newer);
		expect(provider.sent).toHaveLength(1);

		await runDigest(backend);
		expect(provider.sent).toHaveLength(1);
	});

	it("holds the rows when the quota refuses and delivers them once it lifts", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, { title: "Held item" });
		provider.limits = { daily: 1, monthly: null };

		await runDigest(backend);
		expect(provider.sent).toHaveLength(0);
		const pinned = await cursorOf(backend, ada);
		expect(pinned).toBeDefined();
		expect(pinned).toBeLessThan(NOW - ONE_SECOND);

		provider.limits = { daily: null, monthly: null };
		await runDigest(backend);
		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].html).toContain("Held item");
	});

	it("caps one email at 50 items and carries the rest to the next run", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		const base = NOW - 10 * ONE_SECOND;
		for (let index = 0; index < 55; index += 1) {
			await seedRow(backend, ada, {
				title: `Item ${String(index).padStart(2, "0")}`,
				createdAt: base + index,
			});
		}

		await runDigest(backend);
		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].html.match(/Item \d\d<\/a>/g)).toHaveLength(50);
		expect(provider.sent[0].html).toContain("Item 49");
		expect(provider.sent[0].html).not.toContain("Item 50");

		await runDigest(backend);
		expect(provider.sent).toHaveLength(2);
		expect(provider.sent[1].html.match(/Item \d\d<\/a>/g)).toHaveLength(5);
		expect(provider.sent[1].html).toContain("Item 50");
		expect(provider.sent[1].html).not.toContain("Item 49");
	});

	it("escapes row text in the html", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, { title: "<script>x</script>" });

		await runDigest(backend);

		expect(provider.sent[0].html).not.toContain("<script>x</script>");
		expect(provider.sent[0].html).toContain(
			"&lt;script&gt;x&lt;/script&gt;"
		);
	});

	it("starts from 24 hours back when the person has no cursor", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, {
			title: "Stale item",
			createdAt: NOW - 2 * DAY_MS,
		});
		await seedRow(backend, ada, { title: "Fresh item" });

		await runDigest(backend);

		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].html).toContain("Fresh item");
		expect(provider.sent[0].html).not.toContain("Stale item");
	});

	it("keeps the first window when a send is held and time moves on", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(NOW);
			const backend = convexTest(schema, modules);
			const ada = await seedPerson(backend, "ada@example.com");
			await seedRow(backend, ada, {
				title: "Twenty hours old",
				createdAt: NOW - 20 * HOUR,
			});
			provider.limits = { daily: 1, monthly: null };
			await runDigest(backend);
			expect(provider.sent).toHaveLength(0);

			vi.setSystemTime(NOW + 10 * HOUR);
			provider.limits = { daily: null, monthly: null };
			await runDigest(backend);
			expect(provider.sent).toHaveLength(1);
			expect(provider.sent[0].html).toContain("Twenty hours old");
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps rows that share the 50th item's time in the same email", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		const base = NOW - 10 * ONE_SECOND;
		for (let index = 0; index < 50; index += 1) {
			await seedRow(backend, ada, {
				title: `Item ${String(index).padStart(2, "0")}`,
				createdAt: base + index,
			});
		}
		for (const title of ["Tie A", "Tie B"]) {
			await seedRow(backend, ada, { title, createdAt: base + 49 });
		}

		await runDigest(backend);
		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0].html).toContain("Tie A");
		expect(provider.sent[0].html).toContain("Tie B");
		expect(provider.sent[0].html).toContain("52 new notifications");

		await runDigest(backend);
		expect(provider.sent).toHaveLength(1);
	});

	it("escapes quotes and angle brackets in titles and stored paths", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");
		await seedRow(backend, ada, {
			title: 'Say "hi" <b>',
			url: '/perks?perk="x"',
		});

		await runDigest(backend);

		const { html } = provider.sent[0];
		expect(html).toContain("Say &quot;hi&quot; &lt;b&gt;");
		expect(html).toContain(
			'href="https://app.example.com/perks?perk=&quot;x&quot;"'
		);
		expect(html).not.toContain('perk="x"');
		expect(html).not.toContain("<b>");
	});
	it("one person's failing send does not stop the next person's digest", async () => {
		const backend = convexTest(schema, modules);
		const boardMember = await seedPerson(
			backend,
			"boa@example.com",
			"board"
		);
		const ada = await seedPerson(backend, "ada@example.com", "member");
		await seedRow(backend, boardMember, { title: "Board item" });
		await seedRow(backend, ada, { title: "Ada item" });
		provider.failFor = "boa@example.com";
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const logs = vi.spyOn(console, "log");

		await runDigest(backend);

		expect(provider.sent.map((email) => email.to)).toEqual([
			"ada@example.com",
		]);
		expect(errors).toHaveBeenCalledOnce();
		const logged = [...errors.mock.calls, ...logs.mock.calls]
			.flat()
			.map(String)
			.join(" ");
		expect(logged).toContain("[digest] sent 1, held 1");
		expect(logged).not.toContain("example.com");
		expect(await cursorOf(backend, boardMember)).toBeLessThan(
			NOW - ONE_SECOND
		);
	});

	it("gives everyone a digest within a few runs when the quota only has room for one a day", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(NOW);
			const backend = convexTest(schema, modules);
			const ada = await seedPerson(backend, "ada@example.com");
			const bob = await seedPerson(backend, "bob@example.com");
			await seedRow(backend, ada, { title: "Ada first" });
			await seedRow(backend, bob, { title: "Bob first" });
			// A digest may use half of 2: one send a day.
			provider.limits = { daily: 2, monthly: null };

			await runDigest(backend);
			expect(provider.sent).toHaveLength(1);
			const firstTo = provider.sent[0].to;

			vi.setSystemTime(NOW + DAY_MS);
			const luckyId = firstTo === "ada@example.com" ? ada : bob;
			await seedRow(backend, luckyId, {
				title: "Fresh item",
				createdAt: NOW + DAY_MS - ONE_SECOND,
			});
			await runDigest(backend);

			const recipients = provider.sent.map((email) => email.to);
			expect(recipients).toHaveLength(2);
			expect(recipients).toContain("ada@example.com");
			expect(recipients).toContain("bob@example.com");
		} finally {
			vi.useRealTimers();
		}
	});

	it("saves the window start for a person with no cursor and nothing to send", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seedPerson(backend, "ada@example.com");

		await runDigest(backend);

		const cursor = await cursorOf(backend, ada);
		expect(provider.sent).toHaveLength(0);
		expect(cursor).toBeGreaterThan(NOW - DAY_MS - HOUR);
		expect(cursor).toBeLessThan(NOW);
	});
	it.each([
		[5, 0],
		[4, 1],
	])(
		"a digest stops at half the daily quota: %i used of 10 sends %i",
		async (used, expectedSent) => {
			const backend = convexTest(schema, modules);
			const ada = await seedPerson(backend, "ada@example.com");
			await seedRow(backend, ada, { title: "Quota item" });
			provider.limits = { daily: 10, monthly: null };
			await backend.mutation(internal.emailQuota.sync, {
				limits: provider.limits,
				dailyUsed: used,
			});

			await runDigest(backend);

			expect(provider.sent).toHaveLength(expectedSent);
			if (expectedSent === 0) {
				expect(await cursorOf(backend, ada)).toBeLessThan(
					NOW - ONE_SECOND
				);
			}
		}
	);

	it("stops the run after three failures in a row", async () => {
		const backend = convexTest(schema, modules);
		for (const name of ["a", "b", "c", "d", "e"]) {
			const person = await seedPerson(backend, `${name}@example.com`);
			await seedRow(backend, person, { title: `Item ${name}` });
		}
		const send = vi.fn(() => Promise.reject(new Error("provider down")));
		provider.send = send;
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});

		await runDigest(backend);

		expect(send).toHaveBeenCalledTimes(3);
		const logged = errors.mock.calls.flat().map(String).join(" ");
		expect(logged).toContain("[digest] stopped after 3 failures in a row");
		expect(logged).not.toContain("example.com");
	});
});
