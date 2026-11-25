import { convexTest } from "convex-test";
import { strToU8 } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import { PACK_FILE_BYTES_MAX } from "./lib/tv/configStore.ts";
import {
	parseConfigXml,
	serializeConfig,
	type TvConfigSlide,
} from "./lib/tv/configXml.ts";
import { eventSlidePaths } from "./lib/tv/eventSlideFiles.ts";
import { writePackZip } from "./lib/tv/packZip.ts";
import schema from "./schema.ts";

// What `commitEventSlideFiles` really writes (a real render), run through the
// board's pack paths: import, the XML editor, the slide list, and a download
// followed by an upload; plus the event's TV status and the retry of full events.

const modules = import.meta.glob("./**/*.*s");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
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

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
	vi.useRealTimers();
});

async function seedBoard(backend: Backend) {
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

async function seedConfig(backend: Backend): Promise<void> {
	await backend.run(async (context) => {
		const fileId = await context.storage.store(
			new Blob(["x"], { type: PNG })
		);
		await context.db.insert("tvAssets", {
			path: MANUAL.src,
			fileId,
			size: 1,
			contentType: PNG,
		});
		await context.db.insert("tvConfig", {
			transition: "fade",
			version: 1,
			xml: serializeConfig({ transition: "fade", slides: [MANUAL] }),
		});
	});
}

function seedEvent(
	backend: Backend,
	fields: Partial<Doc<"events">> = {}
): Promise<Id<"events">> {
	const startsAt = Date.now() + DAY_MS;
	const endsAt = startsAt + 4 * HOUR_MS;
	return backend.run(async (context) => {
		const pictureId = await context.storage.store(
			new Blob([new Uint8Array(1000)], { type: PNG })
		);
		return context.db.insert("events", {
			name: "Demo night",
			description: "Ten teams show what they built.",
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

function render(backend: Backend, eventId: Id<"events">) {
	return backend.action(internal.tvEvents.renderEventSlide, { eventId });
}

function sync(backend: Backend, eventId: Id<"events">) {
	return backend.mutation(internal.tvEvents.syncEventSlide, { eventId });
}

function byText(left: string, right: string): number {
	return left.localeCompare(right);
}

async function statusOf(backend: Backend, eventId: Id<"events">) {
	const event = await eventRow(backend, eventId);
	return event?.tvStatus;
}

async function savedXml(backend: Backend) {
	const stored = await storedPack(backend);
	return stored.xml;
}

async function slideIds(backend: Backend) {
	const slides = await slidesOf(backend);
	return slides.map((slide) => slide.id);
}

function eventRow(backend: Backend, eventId: Id<"events">) {
	return backend.run((context) => context.db.get(eventId));
}

function pending(backend: Backend, name: string) {
	return backend.run(async (context) => {
		const jobs = await context.db.system
			.query("_scheduled_functions")
			.collect();
		return jobs.filter(
			(job) => job.name === name && job.state.kind === "pending"
		);
	});
}

/** The first pack file counts as HTML that fills the pack's HTML total: no event page fits beside it. */
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

async function storedPack(backend: Backend) {
	const stored = await backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		const assets = await context.db.query("tvAssets").collect();
		const files = await Promise.all(
			assets.map(async (asset) => {
				const blob = await context.storage.get(asset.fileId);
				return {
					path: asset.path,
					buffer: (await blob?.arrayBuffer()) ?? new ArrayBuffer(0),
				};
			})
		);
		return { xml: row?.xml ?? "", files, assets };
	});
	return {
		xml: stored.xml,
		assets: stored.assets,
		files: stored.files.map((file) => ({
			path: file.path,
			bytes: new Uint8Array(file.buffer),
		})),
	};
}

function slidesOf(backend: Backend) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		const parsed = parseConfigXml(row?.xml ?? "");
		return parsed.isOk() ? parsed.value.slides : [];
	});
}

function blobExists(backend: Backend, id: Id<"_storage">) {
	return backend.run(
		async (context) => (await context.storage.getUrl(id)) !== null
	);
}

function uploadZip(backend: Backend, bytes: Uint8Array<ArrayBuffer>) {
	return backend.run((context) =>
		context.storage.store(new Blob([bytes], { type: "application/zip" }))
	);
}

/** A board, the manual pack and one event rendered for real. */
async function rendered() {
	const backend = makeBackend();
	const people = await seedBoard(backend);
	await seedConfig(backend);
	const eventId = await seedEvent(backend);
	await render(backend, eventId);
	return { backend, eventId, ...people };
}

describe("a rendered event slide in the board's pack paths", () => {
	it("survives a manual-only pack import: slide, rows and blobs stay, and it is listed last", async () => {
		const { backend, eventId, asBoard } = await rendered();
		const before = await storedPack(backend);
		const eventAssets = before.assets.filter(
			(asset) => asset.sourceEventId === eventId
		);
		expect(eventAssets.length).toBeGreaterThan(1);
		const upload = await uploadZip(
			backend,
			writePackZip(
				serializeConfig({
					transition: "slide",
					slides: [{ ...MANUAL, id: "b", src: "slides/b.png" }],
				}),
				[{ path: "slides/b.png", bytes: new Uint8Array([1, 2, 3]) }]
			) as Uint8Array<ArrayBuffer>
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: upload })
		).toEqual({ ok: true });
		const slides = await slidesOf(backend);
		expect(slides.map((slide) => slide.id)).toEqual([
			"b",
			`event-${eventId}`,
		]);
		const after = await storedPack(backend);
		const eventAfter = after.assets.filter(
			(asset) => asset.sourceEventId === eventId
		);
		expect(eventAfter.map((asset) => asset._id).toSorted(byText)).toEqual(
			eventAssets.map((asset) => asset._id).toSorted(byText)
		);
		for (const asset of eventAfter)
			expect(await blobExists(backend, asset.fileId)).toBe(true);
	});

	it("is kept by the XML editor when the stored XML comes back with one manual change", async () => {
		const { backend, asBoard } = await rendered();
		const { xml } = await storedPack(backend);
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		const changed = xml.replace('duration="15"', 'duration="30"');
		expect(changed).not.toBe(xml);
		const result = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: changed,
			expectedVersion: row?.version ?? 0,
		});
		expect(result.ok).toBe(true);
		const slides = await slidesOf(backend);
		expect(slides.find((slide) => slide.id === "a")?.duration).toBe(30);
		expect(slides.some((slide) => slide.source === "event")).toBe(true);
	});

	it("reads in the slide list as an event slide titled with the event's name", async () => {
		const { eventId, asBoard, backend } = await rendered();
		const rows = await asBoard.query(api.tvContent.listConfigSlides, {});
		expect(rows.at(-1)).toMatchObject({
			_id: `event-${eventId}`,
			title: "Demo night",
			fromEvent: true,
			eventName: "Demo night",
			isMissing: false,
		});
		await backend.run((context) =>
			context.db.patch(eventId, { name: "Renamed" })
		);
		await render(backend, eventId);
		const renamed = await asBoard.query(api.tvContent.listConfigSlides, {});
		expect(renamed.at(-1)?.title).toBe("Renamed");
	});

	it("downloads and uploads again with one manual slide edited: accepted, the event slide, rows and blobs survive", async () => {
		const { backend, eventId, asBoard } = await rendered();
		const { xml, files, assets } = await storedPack(backend);
		// The download: config.xml plus every stored file, event files included.
		const download = writePackZip(xml, files);
		const parsed = parseConfigXml(xml);
		expect(parsed.isOk() && parsed.value.slides.at(-1)?.source).toBe(
			"event"
		);
		// Edit one manual slide inside the downloaded pack, as a person would.
		const edited = writePackZip(
			xml.replace('duration="15"', 'duration="45"'),
			files
		);
		expect(edited).not.toEqual(download);
		const upload = await uploadZip(
			backend,
			edited as Uint8Array<ArrayBuffer>
		);
		expect(
			await asBoard.action(api.tvPack.importPack, { storageId: upload })
		).toEqual({ ok: true });
		const slides = await slidesOf(backend);
		expect(slides.map((slide) => slide.id)).toEqual([
			"a",
			`event-${eventId}`,
		]);
		expect(slides[0].duration).toBe(45);
		const after = await storedPack(backend);
		function owned(list: typeof assets) {
			return list
				.filter((asset) => asset.sourceEventId === eventId)
				.map((asset) => `${asset.path}=${asset.fileId}`);
		}
		expect(owned(after.assets).toSorted(byText)).toEqual(
			owned(assets).toSorted(byText)
		);
		for (const asset of after.assets)
			expect(await blobExists(backend, asset.fileId)).toBe(true);
		// The event's page was not overwritten by the uploaded copy.
		const page = after.files.find(
			(file) => file.path === eventSlidePaths(eventId).html
		);
		expect(page?.bytes).toEqual(
			files.find((file) => file.path === eventSlidePaths(eventId).html)
				?.bytes
		);
	});

	it("never lets an uploaded manual slide take an event's page", async () => {
		const { backend, eventId, asBoard } = await rendered();
		const before = await storedPack(backend);
		const path = eventSlidePaths(eventId).html;
		const upload = await uploadZip(
			backend,
			writePackZip(
				serializeConfig({
					transition: "fade",
					slides: [
						{ ...MANUAL, id: "mine", type: "html", src: path },
					],
				}),
				[{ path, bytes: strToU8("<p>mine</p>") }]
			) as Uint8Array<ArrayBuffer>
		);
		const result = await asBoard.action(api.tvPack.importPack, {
			storageId: upload,
		});
		expect(result.ok).toBe(false);
		expect(await savedXml(backend)).toBe(before.xml);
	});
});

describe("an event's TV status", () => {
	it("is shown after the slide is committed, with no detail", async () => {
		const { backend, eventId } = await rendered();
		const event = await eventRow(backend, eventId);
		expect(event?.tvStatus).toBe("shown");
		expect(event?.tvStatusDetail).toBeUndefined();
	});

	it("is shown without its picture, saying so, when the picture does not fit", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		await backend.run(async (context) => {
			const row = await context.db.query("tvAssets").first();
			if (row)
				await context.db.patch(row._id, {
					size: PACK_FILE_BYTES_MAX - 150_000,
				});
		});
		const eventId = await backend.run(async (context) => {
			const pictureId = await context.storage.store(
				new Blob([new Uint8Array(300_000)], { type: PNG })
			);
			const startsAt = Date.now() + DAY_MS;
			return context.db.insert("events", {
				name: "Big picture",
				startsAt,
				endsAt: startsAt + HOUR_MS,
				startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
				endsAtLocal: zonedLocalFromEpoch(
					startsAt + HOUR_MS,
					SITE_TIMEZONE
				),
				createdAt: Date.now(),
				showOnTv: true,
				pictureId,
			});
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await render(backend, eventId);
			const event = await eventRow(backend, eventId);
			expect(event?.tvStatus).toBe("shown");
			expect(event?.tvStatusDetail).toBe("noPicture");
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("without its picture")
			);
		} finally {
			warn.mockRestore();
		}
	});

	it("is full, with the reason, when the sync finds no room", async () => {
		const backend = makeBackend();
		await seedConfig(backend);
		await fillHtmlTotal(backend);
		const eventId = await seedEvent(backend);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await sync(backend, eventId);
		} finally {
			warn.mockRestore();
		}
		const event = await eventRow(backend, eventId);
		expect(event?.tvStatus).toBe("full");
		expect(event?.tvStatusDetail).toBe("the pack is full");
	});

	it("is full when the pack fills between the plan and the commit", async () => {
		const { backend, eventId } = await rendered();
		await backend.run((context) =>
			context.db.patch(eventId, { name: "Changed" })
		);
		const plan = await backend.query(internal.tvEvents.eventSlidePlan, {
			eventId,
		});
		expect(plan.kind).toBe("on");
		await fillHtmlTotal(backend);
		const outcome = await backend.mutation(
			internal.tvEvents.commitEventSlide,
			{ eventId, html: plan.kind === "on" ? plan.html : "", files: [] }
		);
		expect(outcome).toBe("full");
		expect(await statusOf(backend, eventId)).toBe("full");
	});

	it("is cleared when the event leaves the TV", async () => {
		const { backend, eventId } = await rendered();
		await backend.run((context) =>
			context.db.patch(eventId, { showOnTv: false })
		);
		await sync(backend, eventId);
		const event = await eventRow(backend, eventId);
		expect(event?.tvStatus).toBeUndefined();
		expect(event?.tvStatusDetail).toBeUndefined();
	});

	it("is waiting while the legacy slides have not been moved to the config", async () => {
		const backend = makeBackend();
		await backend.run(async (context) => {
			const fileId = await context.storage.store(
				new Blob(["x"], { type: PNG })
			);
			await context.db.insert("tvSlides", {
				kind: "image",
				fileId,
				durationSec: 15,
				enabled: true,
				position: 1,
				title: "old",
				updatedAt: 1,
			});
		});
		const eventId = await seedEvent(backend);
		await sync(backend, eventId);
		expect(await statusOf(backend, eventId)).toBe("waiting");
	});
});

describe("listEvents", () => {
	it("hands members no scheduler job ids and no TV status, the board its status but no job ids", async () => {
		const { backend, eventId, asBoard, asMember } = await rendered();
		await sync(backend, eventId);
		const withJobs = await eventRow(backend, eventId);
		expect(withJobs?.tvTransitionJobIds).toBeDefined();
		const jobId = Object.values(withJobs?.tvTransitionJobIds ?? {})[0];
		await backend.run((context) =>
			context.db.patch(eventId, { tvSyncJobId: jobId })
		);
		const memberList = await asMember.query(api.events.listEvents, {});
		const boardList = await asBoard.query(api.events.listEvents, {});
		const [forMember] = memberList;
		const [forBoard] = boardList;
		for (const seen of [forMember, forBoard]) {
			expect(seen).not.toHaveProperty("tvSyncJobId");
			expect(seen).not.toHaveProperty("tvTransitionJobIds");
		}
		expect(forMember).not.toHaveProperty("tvStatus");
		expect(forBoard.tvStatus).toBe("shown");
		expect(forMember.name).toBe("Demo night");
	});
});

async function fullEvent() {
	const backend = makeBackend();
	const people = await seedBoard(backend);
	await seedConfig(backend);
	await fillHtmlTotal(backend);
	const eventId = await seedEvent(backend);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	try {
		await sync(backend, eventId);
	} finally {
		warn.mockRestore();
	}
	return { backend, eventId, ...people };
}
describe("retrying events that were left off for want of room", () => {
	const RETRY = "tvEvents:retryFullEvents";

	it("is scheduled once after a manual removal, however many writes follow", async () => {
		const { backend, asBoard } = await fullEvent();
		expect(await pending(backend, RETRY)).toHaveLength(0);
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			title: "Renamed",
		});
		expect(await pending(backend, RETRY)).toHaveLength(1);
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		expect(await pending(backend, RETRY)).toHaveLength(1);
	});

	it("is not scheduled when no event is full", async () => {
		const { backend, asBoard } = await rendered();
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		expect(await pending(backend, RETRY)).toHaveLength(0);
	});

	it("is not scheduled by an event's own commit, so a retry cannot loop", async () => {
		const { backend, eventId } = await fullEvent();
		const other = await seedEvent(backend, { name: "Second" });
		await backend.run(async (context) => {
			const row = await context.db.query("tvAssets").first();
			if (row)
				await context.db.patch(row._id, {
					contentType: PNG,
					size: 1,
				});
		});
		await render(backend, other);
		expect(await statusOf(backend, other)).toBe("shown");
		expect(await pending(backend, RETRY)).toHaveLength(0);
		// The first event is still full: running the retry and its sync schedules no retry.
		await backend.mutation(internal.tvEvents.retryFullEvents, {});
		await sync(backend, eventId);
		expect(await pending(backend, RETRY)).toHaveLength(0);
	});

	it("syncs the full events, which then come back once the board freed space", async () => {
		const { backend, eventId, asBoard } = await fullEvent();
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		await backend.mutation(internal.tvEvents.retryFullEvents, {});
		const syncs = await pending(backend, "tvEvents:syncEventSlide");
		expect(
			syncs.some(
				(job) =>
					(job.args[0] as { eventId: string }).eventId === eventId
			)
		).toBe(true);
		await sync(backend, eventId);
		await render(backend, eventId);
		expect(await statusOf(backend, eventId)).toBe("shown");
		expect(await slideIds(backend)).toEqual([`event-${eventId}`]);
	});
});
