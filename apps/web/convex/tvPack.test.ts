import { convexTest } from "convex-test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tvMessages } from "./lib/errors/tv.ts";
import {
	editConfig,
	isAwaitingMigration,
	readConfig,
	writeConfig,
} from "./lib/tv/configStore.ts";
import { serializeConfig, type TvConfig } from "./lib/tv/configXml.ts";
import { TV_LIMITS, TV_PACK_LIMITS } from "./lib/tv/constants.ts";
import { shouldDeleteNewPack } from "./lib/tv/packBuild.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const CONFIG: TvConfig = {
	transition: "fade",
	slides: [
		{
			id: "a",
			type: "image",
			src: "slides/a.png",
			duration: 15,
			enabled: true,
		},
	],
};
function newBackend() {
	return convexTest(schema, modules);
}
type Backend = ReturnType<typeof newBackend>;
const PNG = new Uint8Array([137, 80, 78, 71, 9]);

async function seedPack(backend: Backend, version: number) {
	return backend.run(async (context) => {
		const fileId = await context.storage.store(
			new Blob([PNG], { type: "image/png" })
		);
		await context.db.insert("tvAssets", {
			path: "slides/a.png",
			fileId,
			size: PNG.length,
			contentType: "image/png",
		});
		await context.db.insert("tvConfig", {
			transition: "fade",
			version,
			xml: serializeConfig(CONFIG),
		});
		return fileId;
	});
}

function readConfigRow(backend: Backend) {
	return backend.run((context) => context.db.query("tvConfig").first());
}
async function rowField<
	K extends "packFileId" | "packVersion" | "transition" | "version",
>(backend: Backend, key: K) {
	const row = await readConfigRow(backend);
	return row?.[key];
}
async function seedMissingBlob(backend: Backend) {
	const fileId = await seedPack(backend, 3);
	await backend.run((context) => context.storage.delete(fileId));
}
/** A build that fails the same way every time: the zip refuses a path no pack may hold. */
async function seedUnzippable(backend: Backend) {
	await seedPack(backend, 3);
	await backend.run(async (context) => {
		const row = await context.db.query("tvAssets").first();
		if (row) await context.db.patch(row._id, { path: "bad path.png" });
	});
}
function countBlobs(backend: Backend) {
	return backend.run(async (context) => {
		const blobs = await context.db.system.query("_storage").collect();
		return blobs.length;
	});
}
async function storePack(backend: Backend) {
	return backend.run((context) =>
		context.storage.store(new Blob([PNG], { type: "application/zip" }))
	);
}
function isBlobStored(backend: Backend, id: Id<"_storage">) {
	return backend.run(async (context) => {
		const url = await context.storage.getUrl(id);
		return url !== null;
	});
}
function seedPackRow(path: string, fileId: Id<"_storage">) {
	return { path, fileId, size: PNG.length, contentType: "image/png" };
}
async function checkMigration(backend: Backend, isSaved: boolean) {
	return backend.run((context) => isAwaitingMigration(context.db, isSaved));
}

async function scheduledBuilds(backend: Backend) {
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	return jobs.map((job) => job.args[0] as unknown);
}

describe("buildPack", () => {
	it("zips config.xml and every asset for the current version", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		const row = await readConfigRow(backend);
		expect(row?.packVersion).toBe(3);
		const packFileId = row?.packFileId as Id<"_storage">;
		const buffer = await backend.run(async (context) => {
			const blob = await context.storage.get(packFileId);
			// A Uint8Array is not a Convex value, so hand back the ArrayBuffer.
			return await blob!.arrayBuffer();
		});
		const files = unzipSync(new Uint8Array(buffer));
		expect(
			Object.keys(files).toSorted((left, right) =>
				left.localeCompare(right)
			)
		).toEqual(["config.xml", "slides/a.png"]);
		expect(files["slides/a.png"]).toEqual(PNG);
		expect(new TextDecoder().decode(files["config.xml"])).toBe(
			serializeConfig(CONFIG)
		);
	});

	it("does nothing for a version that has moved on", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await backend.action(internal.tvPack.buildPack, { version: 2 });
		const row = await readConfigRow(backend);
		expect(row?.packFileId).toBeUndefined();
	});

	it("skips a stale version before reading any file, so it never retries", async () => {
		// With a missing blob, only the version guard keeps this build from failing and rescheduling.
		const backend = newBackend();
		const fileId = await seedPack(backend, 3);
		await backend.run((context) => context.storage.delete(fileId));
		await backend.action(internal.tvPack.buildPack, { version: 2 });
		expect(await scheduledBuilds(backend)).toEqual([]);
	});

	it("skips and logs, without zipping, when there are too many files", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await backend.run(async (context) => {
			const fileId = await context.storage.store(
				new Blob([PNG], { type: "image/png" })
			);
			// One entry is config.xml, so this many assets make one too many.
			for (let index = 0; index < TV_PACK_LIMITS.maxFiles; index += 1)
				await context.db.insert("tvAssets", {
					path: `assets/f${String(index)}.png`,
					fileId,
					size: PNG.length,
					contentType: "image/png",
				});
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
		expect(await rowField(backend, "packFileId")).toBeUndefined();
		expect(await scheduledBuilds(backend)).toEqual([]);
	});

	it("skips and logs, without retrying, when a file's blob is gone from storage", async () => {
		const backend = newBackend();
		await seedMissingBlob(backend);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0]?.[0])).toContain("slides/a.png");
		error.mockRestore();
		expect(await scheduledBuilds(backend)).toEqual([]);
		expect(await rowField(backend, "packFileId")).toBeUndefined();
	});

	it("packSource counts bytes, not only files, toward the limit", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		const before = await backend.query(
			internal.tvPackInternal.packSource,
			{}
		);
		expect(before?.isOverLimit).toBe(false);
		await backend.run(async (context) => {
			const row = await context.db.query("tvAssets").first();
			if (row)
				await context.db.patch(row._id, {
					size: TV_PACK_LIMITS.packMaxBytes,
				});
		});
		const after = await backend.query(
			internal.tvPackInternal.packSource,
			{}
		);
		expect(after?.isOverLimit).toBe(true);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
		expect(await rowField(backend, "packFileId")).toBeUndefined();
		expect(await scheduledBuilds(backend)).toEqual([]);
	});

	it("stops and logs when the files it reads are over the limit, whatever the rows claim", async () => {
		const backend = newBackend();
		await backend.run(async (context) => {
			const half = new Uint8Array(21_000_000);
			for (const name of ["one", "two"]) {
				const fileId = await context.storage.store(
					new Blob([half], { type: "image/png" })
				);
				await context.db.insert("tvAssets", {
					path: `assets/${name}.png`,
					fileId,
					size: 1,
					contentType: "image/png",
				});
			}
			await context.db.insert("tvConfig", {
				transition: "fade",
				version: 3,
				xml: serializeConfig({ transition: "fade", slides: [] }),
			});
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
		expect(await rowField(backend, "packFileId")).toBeUndefined();
		expect(await scheduledBuilds(backend)).toEqual([]);
		expect(await countBlobs(backend)).toBe(2);
	});

	it("deletes its new blob after a failure only when it is not the live pack", async () => {
		expect(await shouldDeleteNewPack(() => Promise.resolve(false))).toBe(
			true
		);
		expect(await shouldDeleteNewPack(() => Promise.resolve(true))).toBe(
			false
		);
		expect(
			await shouldDeleteNewPack(() => Promise.reject(new Error("down")))
		).toBe(false);
	});

	it("livePackFileId answers with the pack row's blob", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		expect(
			await backend.query(internal.tvPackInternal.livePackFileId, {})
		).toBeNull();
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		expect(
			await backend.query(internal.tvPackInternal.livePackFileId, {})
		).toBe(await rowField(backend, "packFileId"));
	});

	describe("failure", () => {
		it("reschedules itself with the next attempt, leaving no pack blob", async () => {
			const backend = newBackend();
			await seedUnzippable(backend);
			await backend.action(internal.tvPack.buildPack, { version: 3 });
			expect(await scheduledBuilds(backend)).toEqual([
				{ version: 3, attempt: 2 },
			]);
			// Only the asset's own blob: no pack blob was left behind.
			expect(await countBlobs(backend)).toBe(1);
			expect(await rowField(backend, "packFileId")).toBeUndefined();
		});

		it("backs off, then gives up and logs after the last attempt", async () => {
			const backend = newBackend();
			await seedUnzippable(backend);
			const error = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			await backend.action(internal.tvPack.buildPack, {
				version: 3,
				attempt: 2,
			});
			const jobs = await backend.run((context) =>
				context.db.system.query("_scheduled_functions").collect()
			);
			expect(jobs.map((job) => job.args as unknown)).toEqual([
				[{ version: 3, attempt: 3 }],
			]);
			expect(error).not.toHaveBeenCalled();
			await backend.action(internal.tvPack.buildPack, {
				version: 3,
				attempt: 3,
			});
			expect(await scheduledBuilds(backend)).toHaveLength(1);
			expect(error).toHaveBeenCalledOnce();
			error.mockRestore();
			// Only the asset's own blob: no pack blob was left behind.
			expect(await countBlobs(backend)).toBe(1);
		});
	});

	it("replaces the previous pack blob", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		const firstRow = await readConfigRow(backend);
		const first = firstRow?.packFileId as Id<"_storage">;
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		const secondRow = await readConfigRow(backend);
		expect(secondRow?.packFileId).not.toBe(first);
		expect(
			await backend.run((context) => context.storage.getUrl(first))
		).toBeNull();
	});
});

describe("writeConfig", () => {
	it("stores canonical XML, bumps the version and schedules one build", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		const version = await backend.run((context) =>
			writeConfig(context, { ...CONFIG, transition: "none" })
		);
		expect(version).toBe(4);
		const row = await readConfigRow(backend);
		expect(row?.transition).toBe("none");
		expect(row?.xml).toBe(
			serializeConfig({ ...CONFIG, transition: "none" })
		);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs.map((job) => [job.name, job.args])).toEqual([
			["tvPack:buildPack", [{ version: 4 }]],
		]);
	});

	it("drops slide files no slide uses, keeping used, asset and event files", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		const { unusedBlob, keptBlobs } = await backend.run(async (context) => {
			function store() {
				return context.storage.store(
					new Blob([PNG], { type: "image/png" })
				);
			}
			const unusedBlob = await store();
			const assetBlob = await store();
			const eventBlob = await store();
			const personId = await context.db.insert("people", {
				email: "boss@example.com",
				firstName: "Boss",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			const eventId = await context.db.insert("events", {
				name: "Demo",
				startsAt: 1,
				startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
				endsAt: 2,
				endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 1,
			});
			await context.db.insert(
				"tvAssets",
				seedPackRow("slides/unused.png", unusedBlob)
			);
			await context.db.insert(
				"tvAssets",
				seedPackRow("assets/x.png", assetBlob)
			);
			await context.db.insert("tvAssets", {
				...seedPackRow("slides/event.png", eventBlob),
				sourceEventId: eventId,
			});
			return { unusedBlob, keptBlobs: [assetBlob, eventBlob] };
		});
		await backend.run((context) => writeConfig(context, CONFIG));
		const rows = await backend.run((context) =>
			context.db.query("tvAssets").collect()
		);
		expect(
			rows
				.map((row) => row.path)
				.toSorted((left, right) => left.localeCompare(right))
		).toEqual(["assets/x.png", "slides/a.png", "slides/event.png"]);
		expect(
			await backend.run((context) => context.storage.getUrl(unusedBlob))
		).toBeNull();
		for (const kept of keptBlobs)
			expect(
				await backend.run((context) => context.storage.getUrl(kept))
			).not.toBeNull();
	});

	it("drops a slide file once no slide uses it, with its blob", async () => {
		const backend = newBackend();
		const fileId = await seedPack(backend, 3);
		await backend.run((context) =>
			writeConfig(context, { ...CONFIG, slides: [] })
		);
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toEqual([]);
		expect(
			await backend.run((context) => context.storage.getUrl(fileId))
		).toBeNull();
	});
});

describe("setPack", () => {
	it("refuses a stale version: deletes the new blob, keeps the row", async () => {
		const backend = newBackend();
		await seedPack(backend, 4);
		const stale = await storePack(backend);
		const isStored = await backend.mutation(
			internal.tvPackInternal.setPack,
			{
				version: 3,
				packFileId: stale,
			}
		);
		expect(isStored).toBe(false);
		expect(await isBlobStored(backend, stale)).toBe(false);
		const row = await readConfigRow(backend);
		expect(row?.packFileId).toBeUndefined();
		expect(row?.packVersion).toBeUndefined();
	});

	it("refuses when the version moves after the build began, keeping the live pack", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await backend.action(internal.tvPack.buildPack, { version: 3 });
		const live = (await rowField(backend, "packFileId")) as Id<"_storage">;
		const late = await storePack(backend);
		// The edit lands after the source was read, before the pack is set.
		await backend.run((context) =>
			writeConfig(context, { ...CONFIG, transition: "none" })
		);
		const isStored = await backend.mutation(
			internal.tvPackInternal.setPack,
			{
				version: 3,
				packFileId: late,
			}
		);
		expect(isStored).toBe(false);
		expect(await isBlobStored(backend, late)).toBe(false);
		expect(await isBlobStored(backend, live)).toBe(true);
		expect(await rowField(backend, "packFileId")).toBe(live);
	});
});

function seedLegacySlide(backend: Backend) {
	return backend.run((context) =>
		context.db.insert("tvSlides", {
			title: "Old",
			kind: "html",
			htmlText: "<p>x</p>",
			durationSec: 15,
			position: 0,
			enabled: true,
			updatedAt: 1,
		})
	);
}

describe("config reads and edits", () => {
	it("readConfig gives an empty show before the first save", async () => {
		const backend = newBackend();
		expect(await backend.run((context) => readConfig(context.db))).toEqual({
			config: { transition: "fade", slides: [] },
			isSaved: false,
		});
	});

	it("readConfig parses the saved xml", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		expect(await backend.run((context) => readConfig(context.db))).toEqual({
			config: CONFIG,
			isSaved: true,
		});
	});

	it("readConfig fails loudly on xml that does not parse", async () => {
		const backend = newBackend();
		await backend.run((context) =>
			context.db.insert("tvConfig", {
				transition: "fade",
				version: 1,
				xml: "<nope",
			})
		);
		await expect(
			backend.run((context) => readConfig(context.db))
		).rejects.toThrow("does not parse");
	});

	it("isAwaitingMigration is true only for unsaved config with tvSlides rows", async () => {
		const backend = newBackend();
		expect(await checkMigration(backend, false)).toBe(false);
		await seedLegacySlide(backend);
		expect(await checkMigration(backend, false)).toBe(true);
		expect(await checkMigration(backend, true)).toBe(false);
	});

	it("editConfig applies the edit and bumps the version", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		const version = await backend.run((context) =>
			editConfig(context, (config) => ({ ...config, transition: "none" }))
		);
		expect(version).toBe(4);
		expect(await rowField(backend, "transition")).toBe("none");
	});

	it("editConfig is refused while tvSlides wait for migration", async () => {
		const backend = newBackend();
		await seedLegacySlide(backend);
		await expect(
			backend.run((context) => editConfig(context, (config) => config))
		).rejects.toThrow(/TvConfigNotMigrated/);
		expect(await readConfigRow(backend)).toBeNull();
	});

	it("writeConfig refuses a config its own xml cannot round-trip", async () => {
		const backend = newBackend();
		await seedPack(backend, 3);
		await expect(
			backend.run((context) =>
				writeConfig(context, {
					...CONFIG,
					slides: [{ ...CONFIG.slides[0], id: "Not Valid!" }],
				})
			)
		).rejects.toThrow(/TvConfigInvalid/);
		expect(await rowField(backend, "version")).toBe(3);
	});
});

async function boardAndMember(backend: Backend) {
	for (const [email, tier] of [
		["board@example.com", "board"],
		["member@example.com", "member"],
	] as const)
		await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "Test",
				lastName: "Person",
				tier,
				stage: "active",
				stageSince: Date.now(),
			})
		);
	return {
		asBoard: backend.withIdentity({ email: "board@example.com" }),
		asMember: backend.withIdentity({ email: "member@example.com" }),
	};
}

function uploadZip(backend: Backend, bytes: Uint8Array<ArrayBuffer>) {
	return backend.run((context) =>
		context.storage.store(new Blob([bytes], { type: "application/zip" }))
	);
}

const PACK_XML =
	'<tv version="1" transition="slide"><slide id="x" type="image" src="slides/x.png"/></tv>';

function eventPackXml() {
	return serializeConfig({
		transition: "fade",
		slides: [
			{
				id: "a",
				type: "image",
				src: "slides/a.png",
				duration: 15,
				enabled: true,
			},
			{
				id: "event-abc",
				type: "html",
				src: "slides/event-abc.html",
				duration: 20,
				enabled: true,
				source: "event",
				event: "abc",
			},
		],
	});
}

/** A manual file, an event file and the config holding both. Returns the manual blob and the event row. */
function seedWithEvent(backend: Backend) {
	return backend.run(async (context) => {
		const manualFile = await context.storage.store(
			new Blob([PNG], { type: "image/png" })
		);
		const eventFile = await context.storage.store(
			new Blob(["<p>e</p>"], { type: "text/html" })
		);
		const eventId = await context.db.insert("events", {
			name: "Demo night",
			startsAt: 1_790_000_000_000,
			endsAt: 1_790_007_200_000,
			startsAtLocal: "2026-09-21T18:13:20+02:00[Europe/Zurich]",
			endsAtLocal: "2026-09-21T20:13:20+02:00[Europe/Zurich]",
			createdAt: 1_789_000_000_000,
		});
		await context.db.insert("tvAssets", {
			path: "slides/a.png",
			fileId: manualFile,
			size: 5,
			contentType: "image/png",
		});
		await context.db.insert("tvAssets", {
			path: "slides/event-abc.html",
			fileId: eventFile,
			size: 8,
			contentType: "text/html",
			sourceEventId: eventId,
		});
		await context.db.insert("tvConfig", {
			transition: "fade",
			version: 1,
			xml: eventPackXml(),
		});
		return { manualFile, eventFile, eventId };
	});
}

function assetPaths(backend: Backend) {
	return backend.run(async (context) => {
		const rows = await context.db.query("tvAssets").collect();
		return rows
			.map((asset) => asset.path)
			.toSorted((left, right) => left.localeCompare(right));
	});
}

function storeBlob(
	backend: Backend,
	contentType: string,
	bytes: Uint8Array<ArrayBuffer> = PNG
) {
	return backend.run((context) =>
		context.storage.store(new Blob([bytes], { type: contentType }))
	);
}
async function expectSurvives(
	backend: Backend,
	asBoard: Awaited<ReturnType<typeof boardAndMember>>["asBoard"],
	id: Id<"_storage">
) {
	const result = await asBoard.action(api.tvPack.importPack, {
		storageId: id,
	});
	expect(result).toEqual({
		ok: false,
		problems: ["That upload is not a pack zip."],
	});
	expect(await isBlobStored(backend, id)).toBe(true);
}

describe("importPack", () => {
	it("replaces manual files and config, keeps event slides and their files, deletes the upload", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile, eventFile } = await seedWithEvent(backend);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: upload })
		).toEqual({ ok: true });
		const row = await readConfigRow(backend);
		expect(row?.xml).toContain('<slide id="x"');
		expect(row?.xml).toContain('<slide id="event-abc"');
		expect(row?.xml).not.toContain('<slide id="a"');
		expect(row?.transition).toBe("slide");
		expect(await assetPaths(backend)).toEqual([
			"slides/event-abc.html",
			"slides/x.png",
		]);
		expect(await isBlobStored(backend, manualFile)).toBe(false);
		expect(await isBlobStored(backend, eventFile)).toBe(true);
		expect(await isBlobStored(backend, upload)).toBe(false);
	});

	it("schedules exactly one pack build for the new version", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		await seedWithEvent(backend);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		await asBoard.action(api.tvPack.importPack, { storageId: upload });
		expect(await scheduledBuilds(backend)).toEqual([{ version: 2 }]);
	});

	it("keeps an old blob that an event picture still holds", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile, eventId } = await seedWithEvent(backend);
		await backend.run((context) =>
			context.db.patch(eventId, { pictureId: manualFile })
		);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		await asBoard.action(api.tvPack.importPack, { storageId: upload });
		expect(await isBlobStored(backend, manualFile)).toBe(true);
	});

	it("keeps an old blob that a remaining pack file still holds", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile, eventId } = await seedWithEvent(backend);
		await backend.run((context) =>
			context.db.insert("tvAssets", {
				path: "slides/event-abc.png",
				fileId: manualFile,
				size: 5,
				contentType: "image/png",
				sourceEventId: eventId,
			})
		);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		await asBoard.action(api.tvPack.importPack, { storageId: upload });
		expect(await isBlobStored(backend, manualFile)).toBe(true);
	});

	it("returns problems, stores nothing and deletes the upload for a bad pack", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "../x.png": PNG })
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result.ok).toBe(false);
		expect(
			await backend.run((context) =>
				context.db.query("tvAssets").collect()
			)
		).toEqual([]);
		expect(await isBlobStored(backend, upload)).toBe(false);
		expect(await countBlobs(backend)).toBe(0);
	});

	it("leaves the previous config, files and blobs intact when the zip is refused", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile } = await seedWithEvent(backend);
		const before = await readConfigRow(backend);
		const blobsBefore = await countBlobs(backend);
		const upload = await uploadZip(
			backend,
			zipSync({
				"config.xml": strToU8(PACK_XML),
				"slides/x.png": PNG,
				"slides/../../evil.png": PNG,
			})
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result.ok).toBe(false);
		expect(await readConfigRow(backend)).toEqual(before);
		expect(await assetPaths(backend)).toEqual([
			"slides/a.png",
			"slides/event-abc.html",
		]);
		expect(await isBlobStored(backend, manualFile)).toBe(true);
		expect(await countBlobs(backend)).toBe(blobsBefore);
		expect(await scheduledBuilds(backend)).toEqual([]);
	});

	it("refuses a pack over the file limit and leaves the old pack", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		await seedWithEvent(backend);
		const blobsBefore = await countBlobs(backend);
		const files: Record<string, Uint8Array> = {
			"config.xml": strToU8(PACK_XML),
		};
		for (let index = 0; index < TV_PACK_LIMITS.maxFiles; index += 1)
			files[`assets/f${String(index)}.png`] = PNG;
		const upload = await uploadZip(backend, zipSync(files));
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result.ok).toBe(false);
		expect(await assetPaths(backend)).toEqual([
			"slides/a.png",
			"slides/event-abc.html",
		]);
		expect(await countBlobs(backend)).toBe(blobsBefore);
	});

	it("refuses an upload larger than the pack limit", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const upload = await uploadZip(
			backend,
			new Uint8Array(TV_PACK_LIMITS.packMaxBytes + 1)
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result).toEqual({
			ok: false,
			problems: ["The pack is larger than 40 MB."],
		});
		expect(await isBlobStored(backend, upload)).toBe(false);
	});

	it("rejects an oversize upload without downloading it", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const upload = await uploadZip(
			backend,
			new Uint8Array(TV_PACK_LIMITS.packMaxBytes + 1)
		);
		const read = vi.spyOn(Blob.prototype, "arrayBuffer");
		try {
			await asBoard.action(api.tvPack.importPack, { storageId: upload });
			expect(read).not.toHaveBeenCalled();
		} finally {
			read.mockRestore();
		}
	});

	it("replacePack refuses more files than a pack may hold", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile } = await seedWithEvent(backend);
		const outcome = await asBoard.mutation(
			internal.tvPackInternal.replacePack,
			{
				xml: PACK_XML,
				assets: [
					seedPackRow("slides/x.png", manualFile),
					...Array.from(
						{ length: TV_PACK_LIMITS.maxFiles - 1 },
						(_, index) =>
							seedPackRow(
								`assets/f${String(index)}.png`,
								manualFile
							)
					),
				],
			}
		);
		expect(outcome).toEqual({
			ok: false,
			problems: [
				`A pack can hold at most ${String(TV_PACK_LIMITS.maxFiles)} files, event slides included.`,
			],
		});
	});

	it("drops a file at an event slide's path: the event's row and blob stay, nothing manual lands there", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { eventFile } = await seedWithEvent(backend);
		const upload = await uploadZip(
			backend,
			zipSync({
				"config.xml": strToU8(PACK_XML),
				"slides/x.png": PNG,
				"slides/event-abc.html": strToU8("<p>mine</p>"),
			})
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: upload })
		).toEqual({ ok: true });
		const rows = await backend.run((context) =>
			context.db.query("tvAssets").collect()
		);
		const atEventPath = rows.filter(
			(row) => row.path === "slides/event-abc.html"
		);
		expect(atEventPath).toHaveLength(1);
		expect(atEventPath[0].fileId).toBe(eventFile);
		expect(atEventPath[0].sourceEventId).toBeDefined();
	});

	it("refuses a manual slide that points at an event's page, whose file the upload cannot carry", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		await seedWithEvent(backend);
		const before = await readConfigRow(backend);
		const upload = await uploadZip(
			backend,
			zipSync({
				"config.xml": strToU8(
					'<tv version="1"><slide id="mine" type="html" src="slides/event-abc.html"/></tv>'
				),
				"slides/event-abc.html": strToU8("<p>mine</p>"),
			})
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result.ok).toBe(false);
		expect(await readConfigRow(backend)).toEqual(before);
	});

	it("replacePack still refuses a file at an event slide's path", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile } = await seedWithEvent(backend);
		const outcome = await asBoard.mutation(
			internal.tvPackInternal.replacePack,
			{
				xml: PACK_XML,
				assets: [
					seedPackRow("slides/x.png", manualFile),
					seedPackRow("slides/event-abc.html", manualFile),
				],
			}
		);
		expect(outcome).toEqual({
			ok: false,
			problems: ["slides/event-abc.html belongs to an event slide."],
		});
	});

	it("accepts a config that holds event slides by dropping them: the current event slide stays", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		await seedWithEvent(backend);
		const xml =
			'<tv version="1" transition="fade"><slide id="x" type="image" src="slides/x.png"/><slide id="event-zzz" type="image" src="slides/x.png" source="event" event="zzz"/></tv>';
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(xml), "slides/x.png": PNG })
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: upload })
		).toEqual({ ok: true });
		const row = await readConfigRow(backend);
		expect(row?.xml).toContain('id="event-abc"');
		expect(row?.xml).not.toContain("event-zzz");
	});

	it("refuses a member and a signed-out caller", async () => {
		const backend = newBackend();
		const { asMember } = await boardAndMember(backend);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		await expect(
			asMember.action(api.tvPack.importPack, { storageId: upload })
		).rejects.toThrow();
		await expect(
			backend.action(api.tvPack.importPack, { storageId: upload })
		).rejects.toThrow();
		expect(await assetPaths(backend)).toEqual([]);
	});

	it("waits for the tvSlides migration", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>o</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 1,
			})
		);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result).toEqual({
			ok: false,
			problems: ["The TV is being updated. Try again in a few minutes."],
		});
		expect(await assetPaths(backend)).toEqual([]);
		expect(await countBlobs(backend)).toBe(0);
	});

	describe("refuses an upload it must not read or delete", () => {
		it("a blob an event picture holds", async () => {
			const backend = newBackend();
			const { asBoard } = await boardAndMember(backend);
			const { eventId } = await seedWithEvent(backend);
			const id = await storeBlob(backend, "application/zip");
			await backend.run((context) =>
				context.db.patch(eventId, { pictureId: id })
			);
			await expectSurvives(backend, asBoard, id);
		});

		it("a blob a legacy slide holds", async () => {
			const backend = newBackend();
			const { asBoard } = await boardAndMember(backend);
			const id = await storeBlob(backend, "application/zip");
			await backend.run((context) =>
				context.db.insert("tvSlides", {
					title: "Old",
					kind: "image",
					fileId: id,
					durationSec: 15,
					position: 0,
					enabled: true,
					updatedAt: 1,
				})
			);
			await expectSurvives(backend, asBoard, id);
		});

		it("a blob a pack file holds", async () => {
			const backend = newBackend();
			const { asBoard } = await boardAndMember(backend);
			const id = await storeBlob(backend, "application/zip");
			await backend.run((context) =>
				context.db.insert("tvAssets", seedPackRow("slides/a.png", id))
			);
			await expectSurvives(backend, asBoard, id);
		});

		it("the live pack zip", async () => {
			const backend = newBackend();
			const { asBoard } = await boardAndMember(backend);
			const pack = await storePack(backend);
			await backend.run((context) =>
				context.db.insert("tvConfig", {
					transition: "fade",
					version: 1,
					packFileId: pack,
					packVersion: 1,
				})
			);
			await expectSurvives(backend, asBoard, pack);
		});

		it("a blob that is not a zip upload", async () => {
			const backend = newBackend();
			const { asBoard } = await boardAndMember(backend);
			const id = await storeBlob(backend, "application/pdf");
			await expectSurvives(backend, asBoard, id);
		});
	});

	it("accepts the Windows zip content type", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const id = await backend.run((context) =>
			context.storage.store(
				new Blob(
					[
						zipSync({
							"config.xml": strToU8(PACK_XML),
							"slides/x.png": PNG,
						}),
					],
					{ type: "application/x-zip-compressed" }
				)
			)
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: id })
		).toEqual({ ok: true });
	});

	it("refuses a pack whose HTML slides total over the limit", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const each = TV_LIMITS.htmlMax;
		const count = Math.floor(TV_LIMITS.htmlTotalMax / each) + 1;
		const names = Array.from(
			{ length: count },
			(_, index) => `slides/h${String(index)}.html`
		);
		const xml = `<tv version="1" transition="slide">${names
			.map(
				(name, index) =>
					`<slide id="h${String(index)}" type="html" src="${name}"/>`
			)
			.join("")}</tv>`;
		const files: Record<string, Uint8Array> = {
			"config.xml": strToU8(xml),
		};
		for (const name of names) files[name] = new Uint8Array(each).fill(97);
		const upload = await uploadZip(backend, zipSync(files));
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result).toEqual({
			ok: false,
			problems: [tvMessages.TvHtmlTooLarge],
		});
		expect(await assetPaths(backend)).toEqual([]);
		expect(await countBlobs(backend)).toBe(0);
	});

	it("counts the event HTML that stays toward the HTML total", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { eventFile } = await seedWithEvent(backend);
		await backend.run(async (context) => {
			const row = await context.db
				.query("tvAssets")
				.withIndex("by_fileId", (range) =>
					range.eq("fileId", eventFile)
				)
				.first();
			if (row)
				await context.db.patch(row._id, {
					size: TV_LIMITS.htmlTotalMax,
				});
		});
		const upload = await uploadZip(
			backend,
			zipSync({
				"config.xml": strToU8(
					'<tv version="1" transition="slide"><slide id="h" type="html" src="slides/h.html"/></tv>'
				),
				"slides/h.html": strToU8("<p>h</p>"),
			})
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result).toEqual({
			ok: false,
			problems: [tvMessages.TvHtmlTooLarge],
		});
	});

	it("refuses a pack whose files, with the event files that stay, are over the pack maximum", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { eventFile } = await seedWithEvent(backend);
		const stored = await backend.run((context) =>
			context.storage.store(new Blob([PNG]))
		);
		const room = { ...seedPackRow("slides/x.png", stored) };
		const whole = await asBoard.mutation(
			internal.tvPackInternal.replacePack,
			{
				xml: PACK_XML,
				assets: [{ ...room, size: TV_PACK_LIMITS.packMaxBytes }],
			}
		);
		expect(whole).toEqual({
			ok: false,
			problems: [tvMessages.TvPackTooLarge],
		});
		// The event file stays and counts too.
		await backend.run(async (context) => {
			const row = await context.db
				.query("tvAssets")
				.withIndex("by_fileId", (range) =>
					range.eq("fileId", eventFile)
				)
				.first();
			if (row)
				await context.db.patch(row._id, {
					size: 30_000_000,
					contentType: "image/png",
				});
		});
		expect(
			await asBoard.mutation(internal.tvPackInternal.replacePack, {
				xml: PACK_XML,
				assets: [{ ...room, size: 20_000_000 }],
			})
		).toEqual({ ok: false, problems: [tvMessages.TvPackTooLarge] });
		expect(
			await asBoard.mutation(internal.tvPackInternal.replacePack, {
				xml: PACK_XML,
				assets: [{ ...room, size: 10_000_000 }],
			})
		).toEqual({ ok: true });
	});

	it("refuses a pack that lists a path twice", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const stored = await backend.run((context) =>
			context.storage.store(new Blob([PNG]))
		);
		const outcome = await asBoard.mutation(
			internal.tvPackInternal.replacePack,
			{
				xml: PACK_XML,
				assets: [
					{
						...seedPackRow("slides/x.png", stored),
						contentType: "image/png",
					},
					seedPackRow("slides/x.png", stored),
				],
			}
		);
		expect(outcome).toEqual({
			ok: false,
			problems: ["The pack lists a file path twice."],
		});
	});

	it("discards stored files and the upload when the swap throws", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		// A config row whose xml does not parse makes replacePack throw.
		await backend.run((context) =>
			context.db.insert("tvConfig", {
				transition: "fade",
				version: 1,
				xml: "not xml",
			})
		);
		const upload = await uploadZip(
			backend,
			zipSync({ "config.xml": strToU8(PACK_XML), "slides/x.png": PNG })
		);
		await expect(
			asBoard.action(api.tvPack.importPack, { storageId: upload })
		).rejects.toThrow();
		expect(await isBlobStored(backend, upload)).toBe(false);
		expect(await countBlobs(backend)).toBe(0);
	});

	it("dropUpload deletes a loose upload and keeps one something holds", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile } = await seedWithEvent(backend);
		const loose = await backend.run((context) =>
			context.storage.store(new Blob([PNG]))
		);
		await asBoard.mutation(internal.tvPackInternal.dropUpload, {
			storageId: loose,
		});
		await asBoard.mutation(internal.tvPackInternal.dropUpload, {
			storageId: manualFile,
		});
		expect(await isBlobStored(backend, loose)).toBe(false);
		expect(await isBlobStored(backend, manualFile)).toBe(true);
	});

	it("holdsAnyBlob tells a committed swap from a lost one", async () => {
		const backend = newBackend();
		const { asBoard } = await boardAndMember(backend);
		const { manualFile } = await seedWithEvent(backend);
		const loose = await backend.run((context) =>
			context.storage.store(new Blob([PNG]))
		);
		expect(
			await asBoard.query(internal.tvPackInternal.holdsAnyBlob, {
				fileIds: [loose, manualFile],
			})
		).toBe(true);
		expect(
			await asBoard.query(internal.tvPackInternal.holdsAnyBlob, {
				fileIds: [loose],
			})
		).toBe(false);
	});
});
