import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import { TV_LIMITS } from "./lib/tv/constants.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = ReturnType<typeof convexTest>;

afterEach(() => {
	vi.useRealTimers();
});

async function seedDevice(
	backend: Backend,
	fields: { tokenHash: string; revokedAt?: number; lastSeenAt?: number }
) {
	return backend.run(async (context) => {
		return context.db.insert("tvDevices", {
			label: "TV",
			createdAt: 1,
			...fields,
		});
	});
}

function seedSlide(
	backend: Backend,
	fields: {
		title: string;
		position: number;
		enabled: boolean;
		kind?: "image" | "html";
		htmlText?: string;
	}
) {
	return backend.run((context) =>
		context.db.insert("tvSlides", {
			kind: "html",
			htmlText: "<p>x</p>",
			durationSec: 15,
			updatedAt: 7,
			...fields,
		})
	);
}

describe("authenticateDevice", () => {
	it("is true for a live device", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, { tokenHash: "live" });
		expect(
			await backend.mutation(internal.tvInternal.authenticateDevice, {
				tokenHash: "live",
				now: 1000,
			})
		).toBe(true);
	});

	it("is false for a revoked device", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, { tokenHash: "gone", revokedAt: 5 });
		expect(
			await backend.mutation(internal.tvInternal.authenticateDevice, {
				tokenHash: "gone",
				now: 1000,
			})
		).toBe(false);
	});

	it("is false for an unknown hash", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, { tokenHash: "live" });
		expect(
			await backend.mutation(internal.tvInternal.authenticateDevice, {
				tokenHash: "other",
				now: 1000,
			})
		).toBe(false);
	});

	it("rewrites lastSeenAt only after the touch interval", async () => {
		vi.useFakeTimers();
		const backend = convexTest(schema, modules);
		const id = await seedDevice(backend, { tokenHash: "live" });
		async function seen() {
			const row = await backend.run((context) => context.db.get(id));
			return row?.lastSeenAt;
		}
		function touch(now: number) {
			return backend.mutation(internal.tvInternal.authenticateDevice, {
				tokenHash: "live",
				now,
			});
		}

		vi.setSystemTime(1_000_000);
		await touch(Date.now());
		expect(await seen()).toBe(1_000_000);

		vi.setSystemTime(1_000_000 + TV_LIMITS.touchIntervalMs - 1);
		await touch(Date.now());
		expect(await seen()).toBe(1_000_000);

		vi.setSystemTime(1_000_000 + TV_LIMITS.touchIntervalMs);
		await touch(Date.now());
		expect(await seen()).toBe(1_000_000 + TV_LIMITS.touchIntervalMs);
	});
});

describe("manifest", () => {
	it("omits disabled slides and orders by position", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("tvConfig", { transition: "slide", version: 4 })
		);
		const second = await seedSlide(backend, {
			title: "b",
			position: 2,
			enabled: true,
		});
		await seedSlide(backend, { title: "off", position: 1, enabled: false });
		const first = await seedSlide(backend, {
			title: "a",
			position: 0,
			enabled: true,
		});
		const result = await backend.query(internal.tvInternal.manifest, {});
		expect(result.version).toBe(4);
		expect(result.transition).toBe("slide");
		expect(result.slides.map((slide) => slide.id)).toEqual([first, second]);
		expect(result.slides[0]).toEqual({
			id: first,
			kind: "html",
			durationSec: 15,
			rev: 7,
			src: `/tv/slide?id=${first}`,
		});
	});

	it("falls back to defaults with no config row", async () => {
		const backend = convexTest(schema, modules);
		const result = await backend.query(internal.tvInternal.manifest, {});
		expect(result).toEqual({ version: 0, transition: "fade", slides: [] });
	});
});

describe("slideContent", () => {
	it("returns html for an enabled html slide", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedSlide(backend, {
			title: "a",
			position: 0,
			enabled: true,
			htmlText: "<b>hi</b>",
		});
		expect(
			await backend.query(internal.tvInternal.slideContent, { id })
		).toEqual({ kind: "html", htmlText: "<b>hi</b>" });
	});

	it("returns null for an id of another table", async () => {
		const backend = convexTest(schema, modules);
		const deviceId = await seedDevice(backend, { tokenHash: "live" });
		expect(
			await backend.query(internal.tvInternal.slideContent, {
				id: deviceId,
			})
		).toBeNull();
	});

	it("returns null for garbage ids", async () => {
		const backend = convexTest(schema, modules);
		for (const id of ["", "not-an-id", "../../etc", "x".repeat(200)])
			expect(
				await backend.query(internal.tvInternal.slideContent, { id })
			).toBeNull();
	});

	it("returns null for a disabled slide", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedSlide(backend, {
			title: "off",
			position: 0,
			enabled: false,
		});
		expect(
			await backend.query(internal.tvInternal.slideContent, { id })
		).toBeNull();
	});
});
