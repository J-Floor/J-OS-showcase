import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const MEMBER_EMAIL = "member@example.com";
const BOARD_EMAIL = "board@example.com";

async function seedMember(t: ReturnType<typeof convexTest>) {
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: MEMBER_EMAIL,
			firstName: "Mem",
			lastName: "Ber",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: MEMBER_EMAIL });
}

async function seedBoard(t: ReturnType<typeof convexTest>) {
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Board",
			lastName: "Member",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: BOARD_EMAIL });
}

describe("wifi.get", () => {
	it("throws when no wifiConfig row has been written", async () => {
		const t = convexTest(schema, modules);
		const asMember = await seedMember(t);
		await expect(asMember.query(api.wifi.get, {})).rejects.toThrow(
			"Wi-Fi not configured"
		);
	});

	it("returns the wifiConfig row when one has been written", async () => {
		const t = convexTest(schema, modules);
		const asMember = await seedMember(t);
		await t.run((ctx) =>
			ctx.db.insert("wifiConfig", {
				ssid: "Custom SSID",
				password: "custom-pass",
			})
		);

		const result = await asMember.query(api.wifi.get, {});

		expect(result).toEqual({
			ssid: "Custom SSID",
			password: "custom-pass",
		});
	});

	it("rejects an unauthenticated caller", async () => {
		const t = convexTest(schema, modules);
		await expect(t.query(api.wifi.get, {})).rejects.toThrow(
			"Not authenticated"
		);
	});

	it("rejects a signed-in identity with no person row (open sign-up)", async () => {
		const t = convexTest(schema, modules);
		const asStranger = t.withIdentity({ email: "stranger@example.com" });
		await expect(asStranger.query(api.wifi.get, {})).rejects.toThrow(
			"Forbidden"
		);
	});

	it("rejects a visitor tier (registration-only, no space access)", async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "vera@example.com",
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
			})
		);
		const asVisitor = t.withIdentity({ email: "vera@example.com" });
		await expect(asVisitor.query(api.wifi.get, {})).rejects.toThrow(
			"Forbidden"
		);
	});
});

describe("wifi.update", () => {
	it("rejects a non-board caller (requireRole)", async () => {
		const t = convexTest(schema, modules);
		const asMember = await seedMember(t);
		await expect(
			asMember.mutation(api.wifi.update, {
				ssid: "New SSID",
				password: "new-pass",
			})
		).rejects.toThrow("Forbidden");
	});

	it("rejects an empty ssid after trim", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "   ",
				password: "new-pass",
			})
		).rejects.toThrow("SSID is required");
	});

	it("rejects an empty password after trim", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "New SSID",
				password: "   ",
			})
		).rejects.toThrow("Password is required");
	});

	it("upserts the singleton row, and get reflects it after", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);

		await asBoard.mutation(api.wifi.update, {
			ssid: "First SSID",
			password: "first-pass",
		});
		expect(await asBoard.query(api.wifi.get, {})).toEqual({
			ssid: "First SSID",
			password: "first-pass",
		});

		// A second update patches the existing row rather than inserting a
		// second one.
		await asBoard.mutation(api.wifi.update, {
			ssid: "Second SSID",
			password: "second-pass",
		});
		expect(await asBoard.query(api.wifi.get, {})).toEqual({
			ssid: "Second SSID",
			password: "second-pass",
		});
		const rows = await t.run((ctx) => ctx.db.query("wifiConfig").collect());
		expect(rows).toHaveLength(1);
	});

	it("stores the passphrase verbatim, including surrounding spaces", async () => {
		// A WPA passphrase may legitimately contain leading/trailing spaces;
		// update validates it is non-blank but must NOT trim what it stores. If a
		// future change trims args.password, this goes red.
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		await asBoard.mutation(api.wifi.update, {
			ssid: "Spaced SSID",
			password: "  pass with spaces  ",
		});
		expect(await asBoard.query(api.wifi.get, {})).toEqual({
			ssid: "Spaced SSID",
			password: "  pass with spaces  ",
		});
	});

	it("rejects an over-long ssid and password", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "s".repeat(65),
				password: "ok",
			})
		).rejects.toThrow("SSID is too long (max 64 characters).");
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "ok",
				password: "p".repeat(129),
			})
		).rejects.toThrow("Password is too long (max 128 characters).");
	});
});
