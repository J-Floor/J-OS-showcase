import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import { PACK_FILE_BYTES_MAX } from "./lib/tv/configStore.ts";
import {
	parseConfigXml,
	serializeConfig,
	type TvConfigSlide,
} from "./lib/tv/configXml.ts";
import { TV_LIMITS } from "./lib/tv/constants.ts";
import { qrSvg } from "./lib/tv/eventSlide.ts";
import { eventSlideEntry, eventSlidePaths } from "./lib/tv/eventSlideFiles.ts";
import { discardStored } from "./lib/tv/eventSlideSource.ts";
import schema from "./schema.ts";

// A hook the render's font step calls, so a test can change the world between the plan and the commit.
const betweenPlanAndCommit = vi.hoisted(() => ({
	run: undefined as (() => void) | undefined,
}));

vi.mock("./lib/tv/eventSlideFiles.ts", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("./lib/tv/eventSlideFiles.ts")>();
	return {
		...original,
		fontBytes: (key: Parameters<typeof original.fontBytes>[0]) => {
			betweenPlanAndCommit.run?.();
			return original.fontBytes(key);
		},
	};
});

const modules = import.meta.glob("./**/*.*s");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PICTURE_BYTES = 1000;
const PNG = "image/png";

function makeBackend() {
	return convexTest(schema, modules);
}
type Backend = ReturnType<typeof makeBackend>;

const MANUAL: TvConfigSlide = {
	id: "a",
	type: "image",
	src: "slides/a.png",
	duration: 15,
	enabled: true,
	title: "A",
};

afterEach(() => {
	betweenPlanAndCommit.run = undefined;
	vi.useRealTimers();
});

async function seedConfig(
	backend: Backend,
	slides: TvConfigSlide[] = [MANUAL]
): Promise<void> {
	await backend.run(async (context) => {
		for (const slide of slides) {
			if (slide.source === "event") continue;
			const fileId = await context.storage.store(
				new Blob(["x"], { type: PNG })
			);
			await context.db.insert("tvAssets", {
				path: slide.src,
				fileId,
				size: 1,
				contentType: PNG,
			});
		}
		await context.db.insert("tvConfig", {
			transition: "fade",
			version: 1,
			xml: serializeConfig({ transition: "fade", slides }),
		});
	});
}

async function seedEvent(
	backend: Backend,
	fields: Partial<Doc<"events">> = {},
	pictureBytes = PICTURE_BYTES
): Promise<Id<"events">> {
	const startsAt = Date.now() + DAY_MS;
	const endsAt = startsAt + 4 * HOUR_MS;
	return backend.run(async (context) => {
		const pictureId = await context.storage.store(
			new Blob([new Uint8Array(pictureBytes)], { type: PNG })
		);
		return context.db.insert("events", {
			name: "Demo night",
			description: "Ten teams show what they built.",
			link: "https://example.com/demo-night",
			startsAt,
			endsAt,
			startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
			endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
			createdAt: Date.now(),
			showOnTv: true,
			pictureId,
			...fields,
		});
	});
}

function sortedText(values: string[]): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function sortedNumbers(values: number[]): number[] {
	return [...values].sort((left, right) => left - right);
}

function pictureRows(rows: Doc<"tvAssets">[]): Doc<"tvAssets">[] {
	return rows.filter((row) => row.path.includes("/picture-"));
}

function readState(backend: Backend, eventId: Id<"events">) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		const parsed = parseConfigXml(row?.xml ?? "");
		const owned = await context.db
			.query("tvAssets")
			.withIndex("by_sourceEvent", (range) =>
				range.eq("sourceEventId", eventId)
			)
			.collect();
		const blobs = await context.db.system.query("_storage").collect();
		const manual = await context.db
			.query("tvAssets")
			.withIndex("by_path", (range) => range.eq("path", MANUAL.src))
			.first();
		return {
			version: row?.version,
			slides: parsed.isOk() ? parsed.value.slides : [],
			owned,
			blobCount: blobs.length,
			manual,
		};
	});
}

function pageText(backend: Backend, eventId: Id<"events">) {
	return backend.run(async (context) => {
		const row = await context.db
			.query("tvAssets")
			.withIndex("by_path", (range) =>
				range.eq("path", eventSlidePaths(eventId).html)
			)
			.first();
		const blob =
			row === null ? null : await context.storage.get(row.fileId);
		return blob === null ? "" : blob.text();
	});
}

function pendingJobs(backend: Backend, name: string) {
	return backend.run(async (context) => {
		const jobs = await context.db.system
			.query("_scheduled_functions")
			.collect();
		return jobs.filter(
			(job) => job.name === name && job.state.kind === "pending"
		);
	});
}

async function pictureOf(
	backend: Backend,
	eventId: Id<"events">
): Promise<Id<"_storage">> {
	const event = await backend.run((context) => context.db.get(eventId));
	return event?.pictureId as Id<"_storage">;
}

function render(backend: Backend, eventId: Id<"events">) {
	return backend.action(internal.tvEvents.renderEventSlide, { eventId });
}

describe("renderEventSlide", () => {
	it("adds the slide after the manual ones, with its page, fonts and its own copy of the picture", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([
			MANUAL,
			eventSlideEntry(eventId, "Demo night"),
		]);
		const pictureId = await pictureOf(backend, eventId);
		const paths = eventSlidePaths(eventId, { pictureId, extension: "png" });
		expect(sortedText(state.owned.map((row) => row.path))).toEqual(
			sortedText([
				paths.html,
				paths.fonts.body,
				paths.fonts.display,
				paths.picture ?? "",
			])
		);
		const copy = state.owned.find((row) => row.path === paths.picture);
		expect(copy?.fileId).not.toBe(pictureId);
		expect(copy?.size).toBe(PICTURE_BYTES);
		expect(state.version).toBe(2);
		const builds = await pendingJobs(backend, "tvPack:buildPack");
		expect(builds.map((job): unknown => job.args)).toEqual([
			[{ version: 2 }],
		]);
		const page = await pageText(backend, eventId);
		expect(page).toContain(">Demo night</h1>");
		expect(page).toContain('<div class="qr"><svg');
		expect(page).toContain(`src="${paths.picture}"`);
	});

	it("changes nothing when the event has not changed", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const before = await readState(backend, eventId);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(after.version).toBe(before.version);
		expect(after.blobCount).toBe(before.blobCount);
	});

	it("lists the slide again when its files are in place but the config lost it", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await backend.run(async (context) => {
			const row = await context.db.query("tvConfig").first();
			if (row)
				await context.db.patch(row._id, {
					xml: serializeConfig({
						transition: "fade",
						slides: [MANUAL],
					}),
				});
		});
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([
			MANUAL,
			eventSlideEntry(eventId, "Demo night"),
		]);
	});

	it("drops a file the event no longer wants even when the page is unchanged", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const strayPath = `assets/events/${eventId}/picture-stray.png`;
		const strayId = await backend.run(async (context) => {
			const fileId = await context.storage.store(
				new Blob(["old"], { type: PNG })
			);
			await context.db.insert("tvAssets", {
				path: strayPath,
				fileId,
				size: 3,
				contentType: PNG,
				sourceEventId: eventId,
			});
			return fileId;
		});
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.owned.some((row) => row.path === strayPath)).toBe(false);
		const gone = await backend.run((context) =>
			context.db.system.get("_storage", strayId)
		);
		expect(gone).toBeNull();
	});

	it("re-renders a renamed event, keeps the picture copy and drops the old page", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const before = await readState(backend, eventId);
		const html = eventSlidePaths(eventId).html;
		const oldPage = before.owned.find((row) => row.path === html);
		await backend.run((context) =>
			context.db.patch(eventId, { name: "Pitch night" })
		);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(await pageText(backend, eventId)).toContain(">Pitch night</h1>");
		expect(pictureRows(after.owned)).toEqual(pictureRows(before.owned));
		expect(after.version).toBe((before.version ?? 0) + 1);
		const gone = await backend.run((context) =>
			context.db.system.get("_storage", oldPage?.fileId as Id<"_storage">)
		);
		expect(gone).toBeNull();
	});

	it("drops the picture file and shows the wordmark when the picture goes", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await backend.run((context) =>
			context.db.patch(eventId, { pictureId: undefined })
		);
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.owned.some((row) => row.path.includes("/picture-"))).toBe(
			false
		);
		expect(await pageText(backend, eventId)).toContain(
			'class="visual logo"'
		);
	});

	it("leaves the picture out when the pack has no room for it", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		await backend.run(async (context) => {
			const row = await context.db.query("tvAssets").first();
			if (row)
				await context.db.patch(row._id, {
					size: PACK_FILE_BYTES_MAX - 150_000,
				});
		});
		const eventId = await seedEvent(backend, {}, 300_000);
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.slides).toContainEqual(
			eventSlideEntry(eventId, "Demo night")
		);
		expect(state.owned.some((row) => row.path.includes("/picture-"))).toBe(
			false
		);
		expect(await pageText(backend, eventId)).toContain(
			'class="visual logo"'
		);
	});

	it("stays off a TV that already shows 50 slides, and keeps no file", async () => {
		const backend = makeBackend();
		const slides = Array.from({ length: 50 }, (_, index) => ({
			...MANUAL,
			id: `m${String(index)}`,
			src: `slides/m${String(index)}.png`,
		}));
		await seedConfig(backend, slides);
		const eventId = await seedEvent(backend);
		const before = await readState(backend, eventId);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(after.slides).toHaveLength(50);
		expect(after.owned).toEqual([]);
		expect(after.blobCount).toBe(before.blobCount);
		expect(after.version).toBe(before.version);
	});
});

describe("commitEventSlide", () => {
	it("refuses a page rendered from an older event and writes nothing", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		const outcome = await backend.mutation(
			internal.tvEvents.commitEventSlide,
			{ eventId, html: "<p>old</p>", files: [] }
		);
		expect(outcome).toBe("stale");
		const state = await readState(backend, eventId);
		expect(state.version).toBe(1);
		expect(state.owned).toEqual([]);
	});
});

describe("commitEventSlide against a changed event", () => {
	it("refuses the old page after the event was renamed, even when its files are all in place", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const oldPage = await pageText(backend, eventId);
		await backend.run((context) =>
			context.db.patch(eventId, { name: "Pitch night" })
		);
		const before = await readState(backend, eventId);
		const outcome = await backend.mutation(
			internal.tvEvents.commitEventSlide,
			{ eventId, html: oldPage, files: [] }
		);
		expect(outcome).toBe("stale");
		const after = await readState(backend, eventId);
		expect(after.version).toBe(before.version);
		expect(await pageText(backend, eventId)).toBe(oldPage);
	});

	it("deletes the files a render stored when the event moved on before the commit", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
		const backend = makeBackend();
		await seedConfig(backend);
		const startsAt = Date.now() + HOUR_MS;
		const endsAt = startsAt + HOUR_MS;
		const eventId = await seedEvent(backend, {
			startsAt,
			startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
			endsAt,
			endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
		});
		const before = await readState(backend, eventId);
		// The event starts while the render stores: its page is now the live one.
		betweenPlanAndCommit.run = () => vi.setSystemTime(startsAt + 1);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(after.version).toBe(before.version);
		expect(after.owned).toEqual([]);
		expect(after.blobCount).toBe(before.blobCount);
	});
});

describe("syncEventSlide", () => {
	it("schedules the render for an event on the TV", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const jobs = await pendingJobs(backend, "tvEvents:renderEventSlide");
		expect(jobs.map((job): unknown => job.args)).toEqual([[{ eventId }]]);
	});

	it("removes a hidden event's slide and files, and leaves the manual slide alone", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const before = await readState(backend, eventId);
		await backend.run((context) =>
			context.db.patch(eventId, { showOnTv: false })
		);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const after = await readState(backend, eventId);
		expect(after.slides).toEqual([MANUAL]);
		expect(after.owned).toEqual([]);
		expect(after.manual?.fileId).toBe(before.manual?.fileId);
		for (const row of before.owned) {
			const blob = await backend.run((context) =>
				context.db.system.get("_storage", row.fileId)
			);
			expect(blob).toBeNull();
		}
		expect(await pendingJobs(backend, "tvEvents:renderEventSlide")).toEqual(
			[]
		);
	});

	it("removes an event past its TV cutoff", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await backend.run((context) =>
			context.db.patch(eventId, { tvUntil: Date.now() - 1 })
		);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});

	it("removes a deleted event's slide and files", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await backend.run((context) => context.db.delete(eventId));
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});

	it("waits while the old slides wait for their migration", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>x</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 0,
			})
		);
		const eventId = await seedEvent(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		expect(await pendingJobs(backend, "tvEvents:renderEventSlide")).toEqual(
			[]
		);
		const config = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		expect(config).toBeNull();
		// Transitions are left alone too.
		expect(await pendingJobs(backend, "tvEvents:syncEventSlide")).toEqual(
			[]
		);
		const event = await backend.run((context) => context.db.get(eventId));
		expect(event?.tvTransitionJobIds).toBeUndefined();
	});
});

/** Makes the manual file hold nearly all of the 3 MB the pack allows for HTML. */
function fillHtmlTotal(backend: Backend): Promise<void> {
	return backend.run(async (context) => {
		const row = await context.db.query("tvAssets").first();
		if (row)
			await context.db.patch(row._id, {
				contentType: "text/html",
				size: 2_999_000,
			});
	});
}

describe("an event that no longer fits", () => {
	it("is not added when its page would push the HTML past the pack total", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		await fillHtmlTotal(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});

	it("is taken off the TV by the sync, so an old date does not stay", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await fillHtmlTotal(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});

	it("is taken off by a render that finds the pack full", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		await fillHtmlTotal(backend);
		await render(backend, eventId);
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});

	it("is taken off when the pack fills between the plan and the commit", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const page = await pageText(backend, eventId);
		await fillHtmlTotal(backend);
		const outcome = await backend.mutation(
			internal.tvEvents.commitEventSlide,
			{ eventId, html: page, files: [] }
		);
		expect(outcome).toBe("full");
		const state = await readState(backend, eventId);
		expect(state.slides).toEqual([MANUAL]);
		expect(state.owned).toEqual([]);
	});
});

describe("a manual file at the event's page path", () => {
	it("is neither converted into an event row nor deleted", async () => {
		const backend = makeBackend();
		const eventId = await seedEvent(backend);
		const path = eventSlidePaths(eventId).html;
		await seedConfig(backend, [
			MANUAL,
			{ ...MANUAL, id: "m2", type: "html", src: path },
		]);
		const before = await readState(backend, eventId);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(after.slides).toHaveLength(2);
		expect(after.owned).toEqual([]);
		expect(after.version).toBe(before.version);
		const row = await backend.run((context) =>
			context.db
				.query("tvAssets")
				.withIndex("by_path", (range) => range.eq("path", path))
				.first()
		);
		expect(row?.sourceEventId).toBeUndefined();
		const blob = await backend.run((context) =>
			context.db.system.get("_storage", row?.fileId as Id<"_storage">)
		);
		expect(blob).not.toBeNull();
	});
});

async function storedOf(backend: Backend, eventId: Id<"events">) {
	const state = await readState(backend, eventId);
	return state.owned.map((row) => ({
		path: row.path,
		fileId: row.fileId,
		size: row.size,
		contentType: row.contentType,
	}));
}
function exists(backend: Backend, fileId: Id<"_storage">) {
	return backend.run(
		async (context) =>
			(await context.db.system.get("_storage", fileId)) !== null
	);
}

describe("discarding what a render stored", () => {
	it("keeps the blobs of a commit whose reply was lost", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		// The commit landed (its rows exist) but the action saw a throw: it discards.
		const stored = await storedOf(backend, eventId);
		await discardStored(
			(fileIds) =>
				backend.mutation(internal.tvEvents.discardEventBlobs, {
					fileIds,
				}),
			stored
		);
		for (const file of stored)
			expect(await exists(backend, file.fileId)).toBe(true);
	});

	it("deletes a blob nothing holds", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		await discardStored(
			(fileIds) =>
				backend.mutation(internal.tvEvents.discardEventBlobs, {
					fileIds,
				}),
			[{ path: "p", fileId, size: 1, contentType: PNG }]
		);
		expect(await exists(backend, fileId)).toBe(false);
		expect(eventId).toBeDefined();
	});

	it("keeps the blobs and does not throw when the discard fails", async () => {
		const backend = makeBackend();
		const fileId = await backend.run((context) =>
			context.storage.store(new Blob(["x"]))
		);
		await expect(
			discardStored(
				() => Promise.reject(new Error("down")),
				[{ path: "p", fileId, size: 1, contentType: PNG }]
			)
		).resolves.toBeUndefined();
		expect(await exists(backend, fileId)).toBe(true);
	});
});

describe("a stored file that vanished", () => {
	it("is stored again by the next render", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const before = await readState(backend, eventId);
		const font = before.owned.find((row) => row.path.endsWith(".woff2"));
		expect(font).toBeDefined();
		await backend.run((context) =>
			context.storage.delete(font?.fileId as Id<"_storage">)
		);
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		const row = after.owned.find((file) => file.path === font?.path);
		expect(row?.fileId).not.toBe(font?.fileId);
		const blob = await backend.run((context) =>
			context.db.system.get("_storage", row?.fileId as Id<"_storage">)
		);
		expect(blob).not.toBeNull();
	});
});

async function transitionJobs(backend: Backend, eventId: Id<"events">) {
	const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
	const event = await backend.run((context) => context.db.get(eventId));
	return { jobs, ids: event?.tvTransitionJobIds };
}

describe("transitions", () => {
	it("schedules a sync at the start, just after the end and at the cutoff", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const event = await backend.run((context) => context.db.get(eventId));
		const { jobs, ids } = await transitionJobs(backend, eventId);
		const endsAt = event?.endsAt ?? 0;
		expect(sortedNumbers(jobs.map((job) => job.scheduledTime))).toEqual(
			sortedNumbers([
				event?.startsAt ?? 0,
				endsAt + 1,
				endsAt + 5 * DAY_MS,
			])
		);
		for (const job of jobs) expect(job.args).toEqual([{ eventId }]);
		expect(new Set([ids?.starts, ids?.ends, ids?.cutoff])).toEqual(
			new Set(jobs.map((job) => job._id))
		);
	});

	it("replaces them on the next sync, so a moved event has one set", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const moved = Date.now() + 2 * DAY_MS;
		await backend.run((context) =>
			context.db.patch(eventId, {
				startsAt: moved,
				startsAtLocal: zonedLocalFromEpoch(moved, SITE_TIMEZONE),
				endsAt: moved + HOUR_MS,
				endsAtLocal: zonedLocalFromEpoch(
					moved + HOUR_MS,
					SITE_TIMEZONE
				),
			})
		);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const { jobs } = await transitionJobs(backend, eventId);
		expect(sortedNumbers(jobs.map((job) => job.scheduledTime))).toEqual(
			sortedNumbers([
				moved,
				moved + HOUR_MS + 1,
				moved + HOUR_MS + 5 * DAY_MS,
			])
		);
	});

	it("schedules only the transitions still ahead", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const startsAt = Date.now() - HOUR_MS;
		const endsAt = Date.now() + HOUR_MS;
		const eventId = await seedEvent(backend, {
			startsAt,
			startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
			endsAt,
			endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
		});
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const { jobs, ids } = await transitionJobs(backend, eventId);
		expect(sortedNumbers(jobs.map((job) => job.scheduledTime))).toEqual(
			sortedNumbers([endsAt + 1, endsAt + 5 * DAY_MS])
		);
		expect(ids?.starts).toBeUndefined();
	});

	it("cancels them when the event leaves the TV", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		await backend.run((context) =>
			context.db.patch(eventId, { showOnTv: false })
		);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		const { jobs, ids } = await transitionJobs(backend, eventId);
		expect(jobs).toEqual([]);
		expect(ids).toBeUndefined();
	});

	it("renders the live state once the event has started, still with the QR", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const startsAt = Date.now() - HOUR_MS;
		const endsAt = Date.now() + HOUR_MS;
		const eventId = await seedEvent(backend, {
			startsAt,
			startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
			endsAt,
			endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
		});
		await render(backend, eventId);
		const page = await pageText(backend, eventId);
		expect(page).toContain("Happening now at J floor");
		expect(page).toContain('<div class="qr"><svg');
	});

	it("renders the past state without a QR after the end, until the cutoff", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const startsAt = Date.now() - 3 * HOUR_MS;
		const endsAt = Date.now() - HOUR_MS;
		const eventId = await seedEvent(backend, {
			startsAt,
			startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
			endsAt,
			endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
		});
		await render(backend, eventId);
		const page = await pageText(backend, eventId);
		expect(page).toContain("Past event at J floor");
		expect(page).not.toContain('class="qr"');
	});
});

describe("the slide's QR", () => {
	it("encodes the event's link", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const page = await pageText(backend, eventId);
		expect(page).toContain(
			`<div class="qr">${qrSvg("https://example.com/demo-night")}</div>`
		);
	});

	it("has no QR for an event without a link", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend, { link: undefined });
		await render(backend, eventId);
		const page = await pageText(backend, eventId);
		expect(page).not.toContain('class="qr"');
	});
});

describe("reconcileEventSlides", () => {
	it("syncs every event the TV knows of, once each", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		const expired = await seedEvent(backend, {
			tvUntil: Date.now() - 1,
			showOnTv: false,
		});
		const gone = await seedEvent(backend);
		const fresh = await seedEvent(backend);
		await seedConfig(backend, [MANUAL, eventSlideEntry(expired, "Old")]);
		await backend.run(async (context) => {
			const fileId = await context.storage.store(new Blob(["x"]));
			await context.db.insert("tvAssets", {
				path: eventSlidePaths(gone).fonts.body,
				fileId,
				size: 1,
				contentType: "font/woff2",
				sourceEventId: gone,
			});
			await context.db.delete(gone);
		});
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
		const synced = jobs.map(
			(job) => (job.args[0] as { eventId: string }).eventId
		);
		expect(sortedText(synced)).toEqual(sortedText([expired, gone, fresh]));
	});

	it("drops an event slide whose event id is not an event's", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend, [MANUAL, eventSlideEntry("abc", "Old")]);
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		const parsed = parseConfigXml(row?.xml ?? "");
		expect(parsed.isOk() && parsed.value.slides).toEqual([MANUAL]);
	});

	it("looks at the newest events on the TV only, a bounded number", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const off = await seedEvent(backend, { showOnTv: false });
		const first = await seedEvent(backend);
		const surplus = TV_LIMITS.maxSlides + 3;
		for (let index = 0; index < surplus; index += 1)
			await seedEvent(backend, {
				startsAt: Date.now() + (index + 2) * DAY_MS,
			});
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
		const synced = jobs.map(
			(job) => (job.args[0] as { eventId: string }).eventId
		);
		expect(synced).toHaveLength(TV_LIMITS.maxSlides);
		expect(synced).not.toContain(off);
		// The oldest start is the one left out.
		expect(synced).not.toContain(first);
	});

	it("schedules no sync for events that are not on the TV", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const shown = [
			await seedEvent(backend),
			await seedEvent(backend, { startsAt: Date.now() + 2 * DAY_MS }),
		];
		await seedEvent(backend, { showOnTv: false });
		await seedEvent(backend, { showOnTv: false });
		await seedEvent(backend, { showOnTv: undefined });
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
		const synced = jobs.map(
			(job) => (job.args[0] as { eventId: string }).eventId
		);
		expect(sortedText(synced)).toEqual(sortedText(shown));
	});

	it("spaces the syncs it schedules at least a second apart", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		for (let index = 0; index < 3; index += 1)
			await seedEvent(backend, {
				startsAt: Date.now() + (index + 1) * DAY_MS,
			});
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
		const times = jobs
			.map((job) => job.scheduledTime)
			.sort((left, right) => left - right);
		expect(times).toHaveLength(3);
		for (let index = 1; index < times.length; index += 1)
			expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(
				1_000
			);
	});

	it("writes nothing for an event whose slide is already current", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		const backend = makeBackend();
		await seedConfig(backend);
		const eventId = await seedEvent(backend);
		await render(backend, eventId);
		const before = await readState(backend, eventId);
		expect(before.slides.some((slide) => slide.event === eventId)).toBe(
			true
		);
		await backend.mutation(internal.tvEvents.reconcileEventSlides, {});
		// What the reconcile scheduled, run by hand.
		const jobs = await pendingJobs(backend, "tvEvents:syncEventSlide");
		expect(jobs.map((job): unknown => job.args)).toEqual([[{ eventId }]]);
		await backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
		await render(backend, eventId);
		const after = await readState(backend, eventId);
		expect(after.version).toBe(before.version);
		expect(after.slides).toEqual(before.slides);
		expect(after.owned).toEqual(before.owned);
	});
});
