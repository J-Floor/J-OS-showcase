import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import schema from "../schema.ts";

import { boardIds, communityIds, entitledIds, uniqueIds } from "./audience.ts";

const modules = import.meta.glob("../**/*.*s");
const DAY = 86_400_000;

type Seed = {
	email: string;
	tier:
		| "guest"
		| "member"
		| "core"
		| "board"
		| "admin"
		| "prospect"
		| "former";
	stage?: "active" | "onboarding" | "expired" | "queued";
	accessUntil?: number;
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
		})
	);
}

function sorted(ids: string[]): string[] {
	// eslint-disable-next-line id-length -- conventional comparator parameter names
	return [...ids].sort((a, b) => a.localeCompare(b));
}

describe("audience helpers", () => {
	it("uniqueIds drops undefined and duplicates", () => {
		const first = "a" as Id<"people">;
		const second = "b" as Id<"people">;
		expect(uniqueIds([first, undefined, second, first])).toEqual([
			first,
			second,
		]);
	});

	it("boardIds returns entitled board and admin only", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "board@example.org",
			tier: "board",
		});
		const admin = await seed(backend, {
			email: "admin@example.org",
			tier: "admin",
		});
		await seed(backend, { email: "member@example.org", tier: "member" });
		await seed(backend, { email: "gone@example.org", tier: "former" });
		const ids = await backend.run((context) => boardIds(context));
		expect(sorted(ids)).toEqual(sorted([board, admin]));
	});

	it("communityIds skips prospects, formers and closed guest windows", async () => {
		const backend = convexTest(schema, modules);
		const member = await seed(backend, {
			email: "m@example.org",
			tier: "member",
		});
		const core = await seed(backend, {
			email: "c@example.org",
			tier: "core",
		});
		const guest = await seed(backend, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + 10 * DAY,
		});
		await seed(backend, {
			email: "late@example.org",
			tier: "guest",
			accessUntil: Date.now() - DAY,
		});
		await seed(backend, {
			email: "p@example.org",
			tier: "prospect",
			stage: "queued",
		});
		await seed(backend, { email: "f@example.org", tier: "former" });
		const ids = await backend.run((context) => communityIds(context));
		expect(sorted(ids)).toEqual(sorted([member, core, guest]));
	});

	it("entitledIds dedupes and drops people without access", async () => {
		const backend = convexTest(schema, modules);
		const member = await seed(backend, {
			email: "m@example.org",
			tier: "member",
		});
		const former = await seed(backend, {
			email: "f@example.org",
			tier: "former",
		});
		const ids = await backend.run((context) =>
			entitledIds(context, [member, undefined, former, member])
		);
		expect(ids).toEqual([member]);
	});
});
