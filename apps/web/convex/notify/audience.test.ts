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
	t: ReturnType<typeof convexTest>,
	p: Seed
): Promise<Id<"people">> {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email: p.email,
			firstName: p.email.split("@")[0],
			lastName: "X",
			tier: p.tier,
			stage: p.stage ?? "active",
			stageSince: Date.now(),
			accessUntil: p.accessUntil,
		})
	);
}

function sorted(ids: string[]): string[] {
	return [...ids].sort();
}

describe("audience helpers", () => {
	it("uniqueIds drops undefined and duplicates", () => {
		const a = "a" as Id<"people">;
		const b = "b" as Id<"people">;
		expect(uniqueIds([a, undefined, b, a])).toEqual([a, b]);
	});

	it("boardIds returns entitled board and admin only", async () => {
		const t = convexTest(schema, modules);
		const board = await seed(t, {
			email: "board@example.org",
			tier: "board",
		});
		const admin = await seed(t, {
			email: "admin@example.org",
			tier: "admin",
		});
		await seed(t, { email: "member@example.org", tier: "member" });
		await seed(t, { email: "gone@example.org", tier: "former" });
		const ids = await t.run((ctx) => boardIds(ctx));
		expect(sorted(ids)).toEqual(sorted([board, admin]));
	});

	it("communityIds skips prospects, formers and closed guest windows", async () => {
		const t = convexTest(schema, modules);
		const member = await seed(t, {
			email: "m@example.org",
			tier: "member",
		});
		const core = await seed(t, { email: "c@example.org", tier: "core" });
		const guest = await seed(t, {
			email: "g@example.org",
			tier: "guest",
			accessUntil: Date.now() + 10 * DAY,
		});
		await seed(t, {
			email: "late@example.org",
			tier: "guest",
			accessUntil: Date.now() - DAY,
		});
		await seed(t, {
			email: "p@example.org",
			tier: "prospect",
			stage: "queued",
		});
		await seed(t, { email: "f@example.org", tier: "former" });
		const ids = await t.run((ctx) => communityIds(ctx));
		expect(sorted(ids)).toEqual(sorted([member, core, guest]));
	});

	it("entitledIds dedupes and drops people without access", async () => {
		const t = convexTest(schema, modules);
		const member = await seed(t, {
			email: "m@example.org",
			tier: "member",
		});
		const former = await seed(t, {
			email: "f@example.org",
			tier: "former",
		});
		const ids = await t.run((ctx) =>
			entitledIds(ctx, [member, undefined, former, member])
		);
		expect(ids).toEqual([member]);
	});
});
