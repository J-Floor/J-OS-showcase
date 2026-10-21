import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { readWifi } from "./lib/wifi.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const MEMBER_EMAIL = "member@example.com";
const BOARD_EMAIL = "board@example.com";

async function seedMember(backend: ReturnType<typeof convexTest>) {
	await backend.run((context) =>
		context.db.insert("people", {
			email: MEMBER_EMAIL,
			firstName: "Mem",
			lastName: "Ber",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend.withIdentity({ email: MEMBER_EMAIL });
}

async function seedBoard(backend: ReturnType<typeof convexTest>) {
	await backend.run((context) =>
		context.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Board",
			lastName: "Member",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend.withIdentity({ email: BOARD_EMAIL });
}

describe("wifi.get", () => {
	it("throws when no wifiConfig row has been written", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		await expect(asMember.query(api.wifi.get, {})).rejects.toThrow(
			"WifiNotConfigured"
		);
	});

	it("returns the wifiConfig row when one has been written", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
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
		const backend = convexTest(schema, modules);
		await expect(backend.query(api.wifi.get, {})).rejects.toThrow(
			"NotAuthenticated"
		);
	});

	it("rejects a signed-in identity with no person row (open sign-up)", async () => {
		const backend = convexTest(schema, modules);
		const asStranger = backend.withIdentity({
			email: "stranger@example.com",
		});
		await expect(asStranger.query(api.wifi.get, {})).rejects.toThrow(
			"Forbidden"
		);
	});

	it("rejects a visitor tier (registration-only, no space access)", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "vera@example.com",
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
			})
		);
		const asVisitor = backend.withIdentity({ email: "vera@example.com" });
		await expect(asVisitor.query(api.wifi.get, {})).rejects.toThrow(
			"Forbidden"
		);
	});
});

describe("wifi.update", () => {
	it("rejects a non-board caller (requireRole)", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		await expect(
			asMember.mutation(api.wifi.update, {
				ssid: "New SSID",
				password: "new-pass",
			})
		).rejects.toThrow("Forbidden");
	});

	it("rejects an empty ssid after trim", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "   ",
				password: "new-pass",
			})
		).rejects.toThrow("WifiSsidRequired");
	});

	it("rejects an empty password after trim", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "New SSID",
				password: "   ",
			})
		).rejects.toThrow("WifiPasswordRequired");
	});

	it("upserts the singleton row, and get reflects it after", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);

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
		const rows = await backend.run((context) =>
			context.db.query("wifiConfig").collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("stores the passphrase verbatim, including surrounding spaces", async () => {
		// A WPA passphrase may legitimately contain leading/trailing spaces;
		// update validates it is non-blank but must NOT trim what it stores. If a
		// future change trims args.password, this goes red.
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
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
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "s".repeat(65),
				password: "ok",
			})
		).rejects.toThrow(/FieldTooLong/);
		await expect(
			asBoard.mutation(api.wifi.update, {
				ssid: "ok",
				password: "p".repeat(129),
			})
		).rejects.toThrow(/FieldTooLong/);
	});
});

describe("readWifi", () => {
	it("returns a WifiNotConfigured error when no row exists", async () => {
		const backend = convexTest(schema, modules);
		const failure = await backend.run(async (context) => {
			const result = await readWifi(context.db);
			return result.isErr() ? result.error.type : null;
		});
		expect(failure).toBe("WifiNotConfigured");
	});

	it("returns the credentials once a row exists", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("wifiConfig", { ssid: "net", password: "pw" })
		);
		const credentials = await backend.run(async (context) => {
			const result = await readWifi(context.db);
			return result.isOk() ? result.value : null;
		});
		expect(credentials).toEqual({
			ssid: "net",
			password: "pw",
		});
	});
});
