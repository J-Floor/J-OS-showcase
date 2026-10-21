import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import schema from "../schema.ts";

import {
	invariant,
	refuse,
	refuseLogged,
	unwrap,
	unwrapLogged,
} from "./result.ts";

const modules = import.meta.glob("../**/*.*s");

describe("unwrap", () => {
	it("returns the value of an Ok", () => {
		expect(unwrap(ok(3))).toBe(3);
	});

	it("throws a ConvexError carrying the code and the mapped message", () => {
		let thrown: unknown;
		try {
			unwrap(err({ type: "Forbidden" }));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ConvexError);
		expect(
			(thrown as ConvexError<{ code: string; message: string }>).data
		).toEqual({
			code: "Forbidden",
			message: "You can't do that.",
		});
	});

	it("rolls back the writes made before it", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.run(async (context) => {
				await context.db.insert("wifiConfig", {
					ssid: "Example",
					password: "example-password",
				});
				unwrap(err({ type: "Forbidden" }));
			})
		).rejects.toThrow("Forbidden");
		const rows = await backend.run((context) =>
			context.db.query("wifiConfig").collect()
		);
		expect(rows).toEqual([]);
	});
});

describe("refuse", () => {
	it("throws a ConvexError carrying the code and the mapped message", () => {
		let thrown: unknown;
		try {
			refuse({ type: "Forbidden" });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ConvexError);
		expect(
			(thrown as ConvexError<{ code: string; message: string }>).data
		).toEqual({
			code: "Forbidden",
			message: "You can't do that.",
		});
	});

	it("rolls back the writes made before it", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend.run(async (context) => {
				await context.db.insert("wifiConfig", {
					ssid: "Example",
					password: "example-password",
				});
				refuse({ type: "Forbidden" });
			})
		).rejects.toThrow("Forbidden");
		const rows = await backend.run((context) =>
			context.db.query("wifiConfig").collect()
		);
		expect(rows).toEqual([]);
	});
});

describe("unwrapLogged", () => {
	it("returns the value of an Ok without logging", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(unwrapLogged(ok(3), "Merge")).toBe(3);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it("logs the refusal's internal fields under the label, then throws its code", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			let thrown: unknown;
			try {
				unwrapLogged(
					err({ type: "ReadBudgetExceeded", where: "personEvents" }),
					"Purge"
				);
			} catch (error) {
				thrown = error;
			}
			expect((thrown as ConvexError<{ code: string }>).data.code).toBe(
				"ReadBudgetExceeded"
			);
			expect(warn).toHaveBeenCalledWith(
				'Purge refused (ReadBudgetExceeded): {"where":"personEvents"}'
			);
		} finally {
			warn.mockRestore();
		}
	});

	it("logs nothing for a refusal with no fields of its own", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(() =>
				unwrapLogged(err({ type: "Forbidden" }), "Merge")
			).toThrow(ConvexError);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});

describe("refuseLogged", () => {
	it("logs the error's internal fields under the label, then throws its code", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			let thrown: unknown;
			try {
				refuseLogged(
					{
						type: "MergeInvalid",
						violations: "active-without-agreement",
					},
					"Merge"
				);
			} catch (error) {
				thrown = error;
			}
			expect((thrown as ConvexError<{ code: string }>).data.code).toBe(
				"MergeInvalid"
			);
			expect(warn).toHaveBeenCalledWith(
				'Merge refused (MergeInvalid): {"violations":"active-without-agreement"}'
			);
		} finally {
			warn.mockRestore();
		}
	});
});

describe("invariant", () => {
	it("throws a plain Error with the message when the condition is falsy", () => {
		expect(() => {
			invariant(null, "Person not found");
		}).toThrow(new Error("Person not found"));
	});

	it("passes when the condition is truthy", () => {
		expect(() => {
			invariant({}, "unused");
		}).not.toThrow();
	});
});
