import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import {
	planMigration,
	shouldDeleteCopies,
} from "./migrateTvSlidesToConfig.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
type Backend = ReturnType<typeof convexTest>;

async function seedLegacy(backend: Backend) {
	return backend.run(async (context) => {
		const fileId = await context.storage.store(
			new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })
		);
		await context.db.insert("tvConfig", {
			transition: "slide",
			version: 5,
		});
		await context.db.insert("tvSlides", {
			title: "Hello & bye",
			kind: "html",
			htmlText: "<p>Hi</p>",
			durationSec: 15,
			position: 1,
			enabled: false,
			updatedAt: 1,
		});
		await context.db.insert("tvSlides", {
			title: "Poster",
			kind: "image",
			fileId,
			durationSec: 20,
			position: 0,
			enabled: true,
			updatedAt: 1,
		});
		await context.db.insert("tvSlides", {
			title: "Broken",
			kind: "image",
			durationSec: 15,
			position: 2,
			enabled: true,
			updatedAt: 1,
		});
		return fileId;
	});
}

async function seedRows(backend: Backend, count: number) {
	await backend.run(async (context) => {
		for (let index = 0; index < count; index += 1)
			await context.db.insert("tvSlides", {
				title: `S${String(index)}`,
				kind: "html",
				htmlText: "<p/>",
				durationSec: 15,
				position: index,
				enabled: true,
				updatedAt: 1,
			});
	});
}

function run(backend: Backend, isDryRun: boolean) {
	return backend.action(
		internal.migrateTvSlidesToConfig.migrateTvSlidesToConfig,
		{ dryRun: isDryRun }
	);
}

describe("migrateTvSlidesToConfig", () => {
	it("reports without writing on a dry run", async () => {
		const backend = convexTest(schema, modules);
		await seedLegacy(backend);
		const report = await run(backend, true);
		expect(report.status).toBe("dry-run");
		expect(report.slides).toBe(2);
		expect(report.skipped).toEqual(["Broken"]);
		expect(report.totalBytes).toBe(3 + "<p>Hi</p>".length);
		expect(report.problems).toEqual([]);
		expect(report.xml).toContain(
			'<slide id="slide-1" type="image" src="slides/slide-1.jpg" duration="20" enabled="true" title="Poster"/>'
		);
		expect(report.xml).toContain(
			'<slide id="slide-2" type="html" src="slides/slide-2.html" duration="15" enabled="false" title="Hello &amp; bye"/>'
		);
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		expect(row?.xml).toBeUndefined();
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toEqual([]);
		expect(
			await backend.run((context) =>
				context.db.system.query("_scheduled_functions").collect()
			)
		).toEqual([]);
	});

	it("writes the config and copies every file, leaving tvSlides as they are", async () => {
		const backend = convexTest(schema, modules);
		const original = await seedLegacy(backend);
		const report = await run(backend, false);
		expect(report.status).toBe("migrated");
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		expect(row?.transition).toBe("slide");
		expect(row?.version).toBe(6);
		const assets = await backend.run((context) =>
			context.db.query("tvAssets").collect()
		);
		expect(
			assets
				.map((asset) => `${asset.path} ${asset.contentType}`)
				.toSorted((left, right) => left.localeCompare(right))
		).toEqual([
			"slides/slide-1.jpg image/jpeg",
			"slides/slide-2.html text/html",
		]);
		expect(assets.some((asset) => asset.fileId === original)).toBe(false);
		const copied = await backend.run(async (context) => {
			const result: Record<string, { bytes: number[]; size: number }> =
				{};
			for (const asset of assets) {
				const blob = await context.storage.get(asset.fileId);
				result[asset.path] = {
					bytes: [
						...new Uint8Array((await blob?.arrayBuffer()) ?? []),
					],
					size: asset.size,
				};
			}
			return result;
		});
		expect(copied["slides/slide-1.jpg"]).toEqual({
			bytes: [1, 2, 3],
			size: 3,
		});
		expect(copied["slides/slide-2.html"].size).toBe("<p>Hi</p>".length);
		const html = await backend.run(async (context) => {
			const asset = assets.find((item) => item.path.endsWith(".html"));
			const blob = asset ? await context.storage.get(asset.fileId) : null;
			return blob ? await blob.text() : null;
		});
		expect(html).toBe("<p>Hi</p>");
		const legacy = await backend.run((context) =>
			context.db.query("tvSlides").collect()
		);
		expect(legacy).toHaveLength(3);
		expect(legacy.some((slide) => slide.fileId === original)).toBe(true);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs.map((job) => job.name)).toEqual(["tvPack:buildPack"]);
	});

	it("does nothing the second time", async () => {
		const backend = convexTest(schema, modules);
		await seedLegacy(backend);
		await run(backend, false);
		const again = await run(backend, false);
		const dryAgain = await run(backend, true);
		expect(again.status).toBe("already-migrated");
		expect(dryAgain.status).toBe("already-migrated");
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toHaveLength(2);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(1);
	});

	it("leaves each blob one holder: deleting a migrated slide deletes its copy, never the legacy original", async () => {
		const backend = convexTest(schema, modules);
		const original = await seedLegacy(backend);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Test",
				lastName: "Person",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asBoard = backend.withIdentity({ email: "board@example.com" });
		await run(backend, false);
		const migrated = await backend.run((context) =>
			context.db
				.query("tvAssets")
				.withIndex("by_path", (range) =>
					range.eq("path", "slides/slide-1.jpg")
				)
				.first()
		);
		const copyId = migrated?.fileId;
		expect(copyId).toBeDefined();
		await asBoard.mutation(api.tvContent.removeConfigSlide, {
			id: "slide-1",
		});
		const urls = await backend.run(async (context) => ({
			copy: copyId ? await context.storage.getUrl(copyId) : "missing",
			original: await context.storage.getUrl(original),
		}));
		expect(urls.copy).toBeNull();
		expect(urls.original).not.toBeNull();
	});

	it("writes nothing when a config was saved meanwhile", async () => {
		const backend = convexTest(schema, modules);
		await seedLegacy(backend);
		await backend.run(async (context) => {
			const row = await context.db.query("tvConfig").first();
			if (row) await context.db.patch(row._id, { xml: "<config/>" });
		});
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"], { type: "image/png" }))
		);
		const outcome = await backend.mutation(
			internal.migrateTvSlidesToConfig.writeMigratedConfig,
			{
				xml: '<config transition="fade"><slides/></config>',
				fingerprint: "",
				assets: [
					{
						path: "slides/slide-1.png",
						fileId,
						size: 1,
						contentType: "image/png",
					},
				],
			}
		);
		expect(outcome).toBe("configured");
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toEqual([]);
	});

	it("refuses to write when a legacy slide changed after the snapshot", async () => {
		const backend = convexTest(schema, modules);
		await seedLegacy(backend);
		const { fingerprint } = await backend.query(
			internal.migrateTvSlidesToConfig.legacyShow,
			{}
		);
		function attempt(taken: string) {
			return backend.mutation(
				internal.migrateTvSlidesToConfig.writeMigratedConfig,
				{
					xml: '<tv version="1" transition="fade"></tv>',
					assets: [],
					fingerprint: taken,
				}
			);
		}
		// A board edit that only bumps the version (a title edit) is a change too.
		await backend.run(async (context) => {
			const config = await context.db.query("tvConfig").first();
			if (config) await context.db.patch(config._id, { version: 6 });
		});
		expect(await attempt(fingerprint)).toBe("changed");
		const fresh = await backend.query(
			internal.migrateTvSlidesToConfig.legacyShow,
			{}
		);
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Late",
				kind: "html",
				htmlText: "<p>late</p>",
				durationSec: 15,
				position: 3,
				enabled: true,
				updatedAt: 2,
			})
		);
		expect(await attempt(fresh.fingerprint)).toBe("changed");
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		expect(row?.xml).toBeUndefined();
	});

	it("writes when the legacy slides are unchanged since the snapshot", async () => {
		const backend = convexTest(schema, modules);
		await seedLegacy(backend);
		const { fingerprint } = await backend.query(
			internal.migrateTvSlidesToConfig.legacyShow,
			{}
		);
		expect(
			await backend.mutation(
				internal.migrateTvSlidesToConfig.writeMigratedConfig,
				{
					xml: '<tv version="1" transition="fade"></tv>',
					assets: [],
					fingerprint,
				}
			)
		).toBe("written");
	});

	it("accepts exactly 50 legacy rows and refuses 51", async () => {
		const fifty = convexTest(schema, modules);
		await seedRows(fifty, 50);
		const { slides } = await run(fifty, true);
		expect(slides).toBe(50);
		const fiftyOne = convexTest(schema, modules);
		await seedRows(fiftyOne, 51);
		await expect(run(fiftyOne, true)).rejects.toThrow(/more than/);
	});

	it("warns on a dry run about a missing blob and files over the pack maximum", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			const big = await context.storage.store(
				new Blob([new Uint8Array(41_943_041)], { type: "image/png" })
			);
			const gone = await context.storage.store(
				new Blob(["x"], { type: "image/png" })
			);
			await context.storage.delete(gone);
			for (const [position, fileId] of [big, gone].entries())
				await context.db.insert("tvSlides", {
					title: position === 0 ? "Big" : "Gone",
					kind: "image",
					fileId,
					durationSec: 15,
					position,
					enabled: true,
					updatedAt: 1,
				});
		});
		const report = await run(backend, true);
		expect(report.totalBytes).toBe(41_943_041);
		expect(report.problems).toHaveLength(2);
		expect(report.problems?.join("\n")).toMatch(/"Gone".*missing/);
		expect(report.problems?.join("\n")).toMatch(/pack maximum/);
		expect(report.skipped).toEqual(["Gone"]);
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toEqual([]);
	});
});

function isHeld() {
	return Promise.resolve(true);
}
function isFree() {
	return Promise.resolve(false);
}
function failToCheck(): Promise<boolean> {
	return Promise.reject(new Error("query failed"));
}

describe("shouldDeleteCopies", () => {
	it("deletes when the write never happened or was refused", async () => {
		expect(await shouldDeleteCopies("not-sent", isHeld)).toBe(true);
		expect(await shouldDeleteCopies("refused", isHeld)).toBe(true);
	});

	it("keeps the copies of a written config", async () => {
		expect(await shouldDeleteCopies("written", isFree)).toBe(false);
	});

	it("after a lost answer, deletes only when nothing holds them", async () => {
		expect(await shouldDeleteCopies("unknown", isFree)).toBe(true);
		expect(await shouldDeleteCopies("unknown", isHeld)).toBe(false);
		expect(await shouldDeleteCopies("unknown", failToCheck)).toBe(false);
	});
});

describe("planMigration", () => {
	it("keeps order, ids, and skips slides without a known type", () => {
		const plan = planMigration({
			isMigrated: false,
			transition: "fade",
			slides: [
				{
					title: "A",
					kind: "html",
					htmlText: "x",
					durationSec: 9,
					enabled: true,
				},
				{
					title: "B",
					kind: "image",
					fileId: "f" as never,
					contentType: "image/bmp",
					durationSec: 9,
					enabled: true,
				},
				{
					title: "C",
					kind: "html",
					htmlText: "y",
					durationSec: 9,
					enabled: false,
				},
			],
		});
		expect(plan.config.slides.map((slide) => slide.id)).toEqual([
			"slide-1",
			"slide-2",
		]);
		expect(plan.skipped).toEqual(["B"]);
		expect(plan.files.map((file) => file.size)).toEqual([1, 1]);
		expect(plan.config.transition).toBe("fade");
	});
});
