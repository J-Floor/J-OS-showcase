/* eslint-disable @typescript-eslint/no-deprecated -- these tests call the legacy tvSlides mutations on purpose, to pin that they refuse once a config is saved */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	parseConfigXml,
	serializeConfig,
	type TvConfig,
	type TvConfigSlide,
} from "./lib/tv/configXml.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function makeBackend() {
	return convexTest(schema, modules);
}
type Backend = ReturnType<typeof makeBackend>;
type Client = Pick<Backend, "query" | "mutation">;

async function seedPerson(
	backend: Backend,
	email: string,
	tier: "member" | "board"
) {
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
	return backend.withIdentity({ email });
}

async function setup() {
	const backend = makeBackend();
	const asBoard = await seedPerson(backend, "board@example.com", "board");
	const asMember = await seedPerson(backend, "member@example.com", "member");
	return { backend, asBoard, asMember };
}

function store(backend: Backend, type: string, body = "x") {
	return backend.run((context) =>
		context.storage.store(new Blob([body], { type }))
	);
}

const SLIDE_A: TvConfigSlide = {
	id: "a",
	type: "image",
	src: "slides/a.png",
	duration: 15,
	enabled: true,
	title: "A",
};

const EVENT_CONFIG: TvConfig = {
	transition: "fade",
	slides: [
		SLIDE_A,
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
};

async function seedConfig(backend: Backend, config: TvConfig, version = 1) {
	await backend.run(async (context) => {
		for (const slide of config.slides) {
			const fileId = await context.storage.store(
				new Blob(["x"], {
					type: slide.type === "html" ? "text/html" : "image/png",
				})
			);
			await context.db.insert("tvAssets", {
				path: slide.src,
				fileId,
				size: 1,
				contentType: "image/png",
			});
		}
		await context.db.insert("tvConfig", {
			transition: config.transition,
			version,
			xml: serializeConfig(config),
		});
	});
}

function savedXml(backend: Backend) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		return row?.xml;
	});
}

function firstAssetFileId(backend: Backend) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvAssets").first();
		return row?.fileId as Id<"_storage">;
	});
}

function buildJobs(backend: Backend) {
	return backend.run(async (context) => {
		const jobs = await context.db.system
			.query("_scheduled_functions")
			.collect();
		return jobs.filter((job) => job.name === "tvPack:buildPack").length;
	});
}

function configVersion(backend: Backend) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		return row?.version;
	});
}

function blobExists(backend: Backend, fileId: Id<"_storage">) {
	return backend.run(async (context) => {
		const url = await context.storage.getUrl(fileId);
		return url !== null;
	});
}

const TWO_SLIDES: TvConfig = {
	transition: "fade",
	slides: [SLIDE_A, { ...SLIDE_A, id: "b", src: "slides/b.png" }],
};

function assetPaths(backend: Backend) {
	return backend.run(async (context) => {
		const rows = await context.db.query("tvAssets").collect();
		return rows
			.map((row) => row.path)
			.toSorted((left, right) => left.localeCompare(right));
	});
}

describe("addConfigSlide", () => {
	it("adds an image slide as slides/<id>.<ext> and schedules a build", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		const id = await asBoard.mutation(api.tvContent.addConfigSlide, {
			title: "Poster",
			kind: "image",
			fileId,
		});
		expect(id).toBe("slide-1");
		expect(await savedXml(backend)).toContain(
			'<slide id="slide-1" type="image" src="slides/slide-1.png" duration="15" enabled="true" title="Poster"/>'
		);
		expect(await assetPaths(backend)).toEqual(["slides/slide-1.png"]);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs.map((job) => job.name)).toEqual(["tvPack:buildPack"]);
	});

	it("adds an HTML slide from an uploaded text/html blob", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "text/html", "<p>Hi</p>");
		await asBoard.mutation(api.tvContent.addConfigSlide, {
			title: "Hi",
			kind: "html",
			fileId,
			durationSec: 20,
		});
		expect(await assetPaths(backend)).toEqual(["slides/slide-1.html"]);
	});

	it("refuses a wrong type, a member, and a blob something else holds", async () => {
		const { backend, asBoard, asMember } = await setup();
		const text = await store(backend, "text/plain");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId: text,
			})
		).rejects.toThrow();
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "html",
				fileId: text,
			})
		).rejects.toThrow();
		const png = await store(backend, "image/png");
		await expect(
			asMember.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow();
		await asBoard.mutation(api.tvContent.addConfigSlide, {
			title: "x",
			kind: "image",
			fileId: png,
		});
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "y",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow();
	});

	it("is refused while tvSlides wait for the migration", async () => {
		const { backend, asBoard } = await setup();
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>old</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 1,
			})
		);
		const fileId = await store(backend, "image/png");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId,
			})
		).rejects.toThrow(/being updated/);
	});
});

describe("row edits", () => {
	it("updates fields, moves and removes a manual slide (its file goes too)", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, {
			...EVENT_CONFIG,
			slides: [SLIDE_A, { ...SLIDE_A, id: "b", src: "slides/b.png" }],
		});
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			durationSec: 30,
			enabled: false,
			title: "New",
		});
		expect(await savedXml(backend)).toContain(
			'<slide id="a" type="image" src="slides/a.png" duration="30" enabled="false" title="New"/>'
		);
		await asBoard.mutation(api.tvContent.moveConfigSlide, {
			id: "b",
			direction: "up",
		});
		const rows = await asBoard.query(api.tvContent.listConfigSlides, {});
		expect(rows.map((row) => row._id)).toEqual(["b", "a"]);
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		expect(await assetPaths(backend)).toEqual(["slides/b.png"]);
	});

	it("replaces a slide's file, removing the old blob", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const old = await firstAssetFileId(backend);
		const jpeg = await store(backend, "image/jpeg");
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			fileId: jpeg,
		});
		expect(await savedXml(backend)).toContain('src="slides/a.jpg"');
		expect(await assetPaths(backend)).toEqual(["slides/a.jpg"]);
		expect(
			await backend.run((context) => context.storage.getUrl(old))
		).toBeNull();
	});

	it("never edits an event slide by hand", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		await expect(
			asBoard.mutation(api.tvContent.updateConfigSlide, {
				id: "event-abc",
				enabled: false,
			})
		).rejects.toThrow(/comes from an event/);
		await expect(
			asBoard.mutation(api.tvContent.removeConfigSlide, {
				id: "event-abc",
			})
		).rejects.toThrow(/comes from an event/);
		const rows = await asBoard.query(api.tvContent.listConfigSlides, {});
		expect(rows[1]).toMatchObject({
			_id: "event-abc",
			fromEvent: true,
			isMissing: false,
		});
	});
});

describe("saveConfigXml", () => {
	it("saves valid XML canonically and returns the new version", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 7);
		const xml = serializeConfig({
			...EVENT_CONFIG,
			transition: "slide",
		}).replaceAll("  <", "\t<");
		const result = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml,
			expectedVersion: 7,
		});
		expect(result).toEqual({ ok: true, version: 8 });
		expect(await savedXml(backend)).toBe(
			serializeConfig({ ...EVENT_CONFIG, transition: "slide" })
		);
	});

	it("returns problems with lines instead of saving", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 7);
		const syntax = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: '<tv version="1">\n<slide',
			expectedVersion: 7,
		});
		expect(syntax.ok).toBe(false);
		const missing = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: serializeConfig({
				...EVENT_CONFIG,
				slides: [
					...EVENT_CONFIG.slides,
					{
						id: "z",
						type: "image",
						src: "slides/z.png",
						duration: 15,
						enabled: true,
					},
				],
			}),
			expectedVersion: 7,
		});
		expect(missing).toEqual({
			ok: false,
			problems: [
				'Slide "z": slides/z.png is not in the pack. Upload it first.',
			],
		});
		const dropped = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: serializeConfig({ ...EVENT_CONFIG, slides: [SLIDE_A] }),
			expectedVersion: 7,
		});
		expect(dropped.ok).toBe(false);
		expect(await savedXml(backend)).toBe(serializeConfig(EVENT_CONFIG));
	});

	it("refuses a stale version", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 7);
		await expect(
			asBoard.mutation(api.tvContent.saveConfigXml, {
				xml: serializeConfig(EVENT_CONFIG),
				expectedVersion: 6,
			})
		).rejects.toThrow(/changed meanwhile/);
	});
});

describe("reads", () => {
	it("getPackState gives the XML (an empty show before the first save)", async () => {
		const { asBoard } = await setup();
		const state = await asBoard.query(api.tvContent.getPackState, {});
		expect(state).toEqual({
			xml: serializeConfig({ transition: "fade", slides: [] }),
			version: 0,
			packVersion: null,
			missingAssets: [],
			packUrl: null,
			isAwaitingMigration: false,
		});
	});

	it("getPackState says when legacy slides still wait for the migration", async () => {
		const { backend, asBoard } = await setup();
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>old</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 1,
			})
		);
		const state = await asBoard.query(api.tvContent.getPackState, {});
		expect(state.isAwaitingMigration).toBe(true);
		await seedConfig(backend, EVENT_CONFIG);
		const after = await asBoard.query(api.tvContent.getPackState, {});
		expect(after.isAwaitingMigration).toBe(false);
	});

	it("previewPack lists enabled slides and assets with URLs", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		await backend.run(async (context) => {
			const fileId = await context.storage.store(
				new Blob(["x"], { type: "image/png" })
			);
			await context.db.insert("tvAssets", {
				path: "assets/logo.png",
				fileId,
				size: 1,
				contentType: "image/png",
			});
		});
		const preview = await asBoard.query(api.tvContent.previewPack, {});
		expect(preview.slides.map((slide) => slide.id)).toEqual([
			"a",
			"event-abc",
		]);
		expect(preview.assets.map((asset) => asset.path)).toEqual([
			"assets/logo.png",
		]);
	});

	it("is board-only", async () => {
		const { asMember } = await setup();
		await expect(
			asMember.query(api.tvContent.getPackState, {})
		).rejects.toThrow();
		await expect(
			asMember.query(api.tvContent.listConfigSlides, {})
		).rejects.toThrow();
	});
});

describe("blob holders", () => {
	it("discardUpload keeps a blob a pack file holds", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const fileId = await firstAssetFileId(backend);
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(
			await backend.run((context) => context.storage.getUrl(fileId))
		).not.toBeNull();
	});

	it("both discard mutations keep the live pack zip", async () => {
		const { backend, asBoard } = await setup();
		const packFileId = await store(backend, "application/zip");
		await backend.run((context) =>
			context.db.insert("tvConfig", {
				transition: "fade",
				version: 2,
				packFileId,
				packVersion: 2,
			})
		);
		await asBoard.mutation(api.tv.discardUpload, { fileId: packFileId });
		await asBoard.mutation(api.events.discardEventPictureUpload, {
			fileId: packFileId,
		});
		expect(await blobExists(backend, packFileId)).toBe(true);
	});

	it("finds a legacy slide's blob by index, however many legacy rows there are", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		await backend.run(async (context) => {
			// Past the 51 rows a table read would look at.
			for (let position = 0; position < 60; position += 1)
				await context.db.insert("tvSlides", {
					title: `S${String(position)}`,
					kind: position === 59 ? "image" : "html",
					...(position === 59 ? { fileId } : { htmlText: "<p/>" }),
					durationSec: 15,
					position,
					enabled: true,
					updatedAt: 1,
				});
		});
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(await blobExists(backend, fileId)).toBe(true);
	});
});

describe("setTransition", () => {
	it("writes into config.xml once one is saved", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		await asBoard.mutation(api.tv.setTransition, { transition: "none" });
		expect(await savedXml(backend)).toContain('transition="none"');
	});
});

describe("legacy slide mutations", () => {
	it("refuse once a config.xml is saved, so no edit skips the pack build", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		const slideId = await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>old</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 1,
			})
		);
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "N",
				kind: "html",
				htmlText: "<p>n</p>",
			})
		).rejects.toThrow(/edited through the TV config/);
		await expect(
			asBoard.mutation(api.tv.updateSlide, {
				id: slideId,
				enabled: false,
			})
		).rejects.toThrow(/edited through the TV config/);
		await expect(
			asBoard.mutation(api.tv.moveSlide, { id: slideId, direction: "up" })
		).rejects.toThrow(/edited through the TV config/);
		await expect(
			asBoard.mutation(api.tv.deleteSlide, { id: slideId })
		).rejects.toThrow(/edited through the TV config/);
		const row = await backend.run((context) =>
			context.db.query("tvConfig").first()
		);
		expect(row?.version).toBe(3);
		const slides = await backend.run((context) =>
			context.db.query("tvSlides").collect()
		);
		expect(slides).toHaveLength(1);
		expect(slides[0]?.enabled).toBe(true);
	});
});

describe("blob holders in the pack store", () => {
	it("a removed slide's blob an event picture also holds is not deleted by the prune", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		const eventId = await asBoard.mutation(api.events.createEvent, {
			name: "Demo night",
			startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
		});
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			pictureId: fileId,
		});
		await backend.run(async (context) => {
			await context.db.insert("tvAssets", {
				path: "slides/a.png",
				fileId,
				size: 1,
				contentType: "image/png",
			});
			await context.db.insert("tvConfig", {
				transition: "fade",
				version: 1,
				xml: serializeConfig({ transition: "fade", slides: [SLIDE_A] }),
			});
		});
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		expect(await assetPaths(backend)).toEqual([]);
		expect(
			await backend.run((context) => context.storage.getUrl(fileId))
		).not.toBeNull();
	});
});

describe("board-only", () => {
	it("refuses a member and a signed-out caller on every public function", async () => {
		const { backend, asMember } = await setup();
		await seedConfig(backend, TWO_SLIDES, 4);
		const fileId = await store(backend, "image/png");
		const calls = [
			(client: Client) =>
				client.mutation(api.tvContent.saveConfigXml, {
					xml: serializeConfig(TWO_SLIDES),
					expectedVersion: 4,
				}),
			(client: Client) =>
				client.query(api.tvContent.getConfigSlide, { id: "a" }),
			(client: Client) =>
				client.mutation(api.tvContent.updateConfigSlide, {
					id: "a",
					enabled: false,
				}),
			(client: Client) =>
				client.mutation(api.tvContent.moveConfigSlide, {
					id: "b",
					direction: "up",
				}),
			(client: Client) =>
				client.mutation(api.tvContent.removeConfigSlide, { id: "a" }),
			(client: Client) => client.query(api.tvContent.previewPack, {}),
			(client: Client) =>
				client.mutation(api.tvContent.addConfigSlide, {
					title: "x",
					kind: "image",
					fileId,
				}),
			(client: Client) =>
				client.query(api.tvContent.listConfigSlides, {}),
			(client: Client) => client.query(api.tvContent.getPackState, {}),
		];
		for (const call of calls) {
			await expect(call(asMember)).rejects.toThrow();
			await expect(call(backend)).rejects.toThrow();
		}
		expect(await configVersion(backend)).toBe(4);
		expect(await buildJobs(backend)).toBe(0);
	});
});

describe("getConfigSlide", () => {
	it("gives the slide and a URL to its file", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const slide = await asBoard.query(api.tvContent.getConfigSlide, {
			id: "a",
		});
		expect(slide).toMatchObject({
			_id: "a",
			kind: "image",
			isMissing: false,
		});
		expect(slide?.url).toEqual(expect.stringContaining("http"));
	});

	it("has no URL and says so when the slide's file is missing", async () => {
		const { backend, asBoard } = await setup();
		await backend.run((context) =>
			context.db.insert("tvConfig", {
				transition: "fade",
				version: 1,
				xml: serializeConfig({ transition: "fade", slides: [SLIDE_A] }),
			})
		);
		const slide = await asBoard.query(api.tvContent.getConfigSlide, {
			id: "a",
		});
		expect(slide?.url).toBeNull();
		expect(slide?.isMissing).toBe(true);
	});

	it("gives null for an unknown slide, so a sheet open on a deleted slide does not crash", async () => {
		const { asBoard } = await setup();
		expect(
			await asBoard.query(api.tvContent.getConfigSlide, { id: "nope" })
		).toBeNull();
	});
});

describe("previewPack details", () => {
	it("leaves out disabled slides and slides whose file is missing, and gives URLs", async () => {
		const { backend, asBoard } = await setup();
		const config: TvConfig = {
			transition: "none",
			slides: [
				SLIDE_A,
				{
					...SLIDE_A,
					id: "off",
					src: "slides/off.png",
					enabled: false,
				},
				{ ...SLIDE_A, id: "gone", src: "slides/gone.png" },
			],
		};
		await seedConfig(backend, config);
		await backend.run(async (context) => {
			const rows = await context.db.query("tvAssets").collect();
			const gone = rows.find((row) => row.path === "slides/gone.png");
			if (gone) await context.db.delete(gone._id);
		});
		const preview = await asBoard.query(api.tvContent.previewPack, {});
		expect(preview.transition).toBe("none");
		expect(preview.slides).toHaveLength(1);
		expect(preview.slides[0]).toMatchObject({
			id: "a",
			kind: "image",
			durationSec: 15,
		});
		expect(preview.slides[0]?.url).toEqual(expect.stringContaining("http"));
	});
});

describe("file replacement", () => {
	it("removes the old blob when the new file has the same extension", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const old = await firstAssetFileId(backend);
		const next = await store(backend, "image/png", "y");
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			fileId: next,
		});
		expect(await assetPaths(backend)).toEqual(["slides/a.png"]);
		expect(await firstAssetFileId(backend)).toBe(next);
		expect(await blobExists(backend, old)).toBe(false);
		expect(await blobExists(backend, next)).toBe(true);
	});

	it("keeps the old blob when an event picture also holds it", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const old = await firstAssetFileId(backend);
		const eventId = await asBoard.mutation(api.events.createEvent, {
			name: "Demo night",
			startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
		});
		await backend.run((context) =>
			context.db.patch(eventId, { pictureId: old })
		);
		const next = await store(backend, "image/png", "y");
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			fileId: next,
		});
		expect(await firstAssetFileId(backend)).toBe(next);
		expect(await blobExists(backend, old)).toBe(true);
	});

	it("replaces an HTML slide's file", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, {
			transition: "fade",
			slides: [
				{
					id: "h",
					type: "html",
					src: "slides/h.html",
					duration: 15,
					enabled: true,
					title: "H",
				},
			],
		});
		const old = await firstAssetFileId(backend);
		const next = await store(backend, "text/html", "<p>new</p>");
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "h",
			fileId: next,
		});
		expect(await assetPaths(backend)).toEqual(["slides/h.html"]);
		expect(await firstAssetFileId(backend)).toBe(next);
		expect(await blobExists(backend, old)).toBe(false);
		const wrongKind = await store(backend, "image/png");
		await expect(
			asBoard.mutation(api.tvContent.updateConfigSlide, {
				id: "h",
				fileId: wrongKind,
			})
		).rejects.toThrow();
	});

	it("refuses a new file on an event slide and leaves the pack alone", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		const before = await savedXml(backend);
		const html = await store(backend, "text/html", "<p>x</p>");
		await expect(
			asBoard.mutation(api.tvContent.updateConfigSlide, {
				id: "event-abc",
				fileId: html,
			})
		).rejects.toThrow(/comes from an event/);
		expect(await savedXml(backend)).toBe(before);
		expect(await buildJobs(backend)).toBe(0);
	});

	it("refuses a path another slide's file already uses", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, {
			transition: "fade",
			slides: [{ ...SLIDE_A, id: "x", src: "slides/slide-1.png" }],
		});
		const png = await store(backend, "image/png", "y");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "New",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow();
		expect(await assetPaths(backend)).toEqual(["slides/slide-1.png"]);
		expect(await buildJobs(backend)).toBe(0);
	});
});

describe("pack limits on add", () => {
	it("refuses HTML past the total across all HTML slides", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, {
			transition: "fade",
			slides: [
				{
					id: "h",
					type: "html",
					src: "slides/h.html",
					duration: 15,
					enabled: true,
				},
			],
		});
		await backend.run(async (context) => {
			const row = await context.db.query("tvAssets").first();
			if (row) await context.db.patch(row._id, { size: 2_900_000 });
		});
		const html = await store(backend, "text/html", "x".repeat(200_000));
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "More",
				kind: "html",
				fileId: html,
			})
		).rejects.toThrow(/across all slides/);
		const small = await store(backend, "text/html", "<p>ok</p>");
		await asBoard.mutation(api.tvContent.addConfigSlide, {
			title: "Small",
			kind: "html",
			fileId: small,
		});
	});

	it("refuses a file once the pack is full", async () => {
		const { backend, asBoard } = await setup();
		await backend.run(async (context) => {
			await context.db.insert("tvConfig", {
				transition: "fade",
				version: 1,
				xml: serializeConfig({ transition: "fade", slides: [] }),
			});
			const fileId = await context.storage.store(
				new Blob(["x"], { type: "image/png" })
			);
			for (let index = 0; index < 199; index += 1)
				await context.db.insert("tvAssets", {
					path: `assets/f${String(index)}.png`,
					fileId,
					size: 1,
					contentType: "image/png",
				});
		});
		const png = await store(backend, "image/png", "y");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow(/at most 200 files/);
	});
});

async function setAssetSize(backend: Backend, path: string, size: number) {
	await backend.run(async (context) => {
		const row = await context.db
			.query("tvAssets")
			.withIndex("by_path", (range) => range.eq("path", path))
			.first();
		if (row) await context.db.patch(row._id, { size });
	});
}

describe("pack size", () => {
	it("refuses a new file that would take the pack over its maximum, and takes one that fits", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		await setAssetSize(backend, "slides/a.png", 41_900_000);
		const png = await store(backend, "image/png", "y");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow(/pack would be larger than 40 MB/);
		await setAssetSize(backend, "slides/a.png", 40_000_000);
		await asBoard.mutation(api.tvContent.addConfigSlide, {
			title: "x",
			kind: "image",
			fileId: png,
		});
	});

	it("keeps room for config.xml", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		// Under the maximum, but within 64 KiB of it: config.xml needs that room.
		await setAssetSize(backend, "slides/a.png", 41_943_040 - 1000);
		const png = await store(backend, "image/png", "y");
		await expect(
			asBoard.mutation(api.tvContent.addConfigSlide, {
				title: "x",
				kind: "image",
				fileId: png,
			})
		).rejects.toThrow(/pack would be larger/);
	});

	it("takes the replaced file's size out when a file is replaced, and refuses a larger one", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, TWO_SLIDES);
		await setAssetSize(backend, "slides/a.png", 41_000_000);
		// 1.1 MB in place of a 41 MB file fits; counted on top of it, it would not.
		const smaller = await store(
			backend,
			"image/png",
			"y".repeat(1_100_000)
		);
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			fileId: smaller,
		});
		await setAssetSize(backend, "slides/b.png", 41_000_000);
		const bigger = await store(backend, "image/png", "z".repeat(1_200_000));
		await expect(
			asBoard.mutation(api.tvContent.updateConfigSlide, {
				id: "a",
				fileId: bigger,
			})
		).rejects.toThrow(/pack would be larger than 40 MB/);
	});
});

describe("a pack file whose blob vanished", () => {
	it("is flagged in the slide list, the slide and the pack state", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, { ...EVENT_CONFIG, slides: [SLIDE_A] });
		const fileId = await firstAssetFileId(backend);
		await backend.run((context) => context.storage.delete(fileId));
		const rows = await asBoard.query(api.tvContent.listConfigSlides, {});
		expect(rows[0]).toMatchObject({ _id: "a", isMissing: true });
		const slide = await asBoard.query(api.tvContent.getConfigSlide, {
			id: "a",
		});
		expect(slide).toMatchObject({ isMissing: true, url: null });
		const state = await asBoard.query(api.tvContent.getPackState, {});
		expect(state.missingAssets).toEqual(["slides/a.png"]);
	});
});

function slideIds(backend: Backend) {
	return backend.run(async (context) => {
		const row = await context.db.query("tvConfig").first();
		const parsed = parseConfigXml(row?.xml ?? "");
		return parsed.isOk()
			? parsed.value.slides.map((slide) => slide.id)
			: [];
	});
}

describe("event slide delay and order", () => {
	it("lets the board set an event slide's delay", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "event-abc",
			durationSec: 45,
		});
		expect(await savedXml(backend)).toContain(
			'src="slides/event-abc.html" duration="45"'
		);
	});

	it("still refuses to retitle an event slide, even with a delay", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		const before = await savedXml(backend);
		await expect(
			asBoard.mutation(api.tvContent.updateConfigSlide, {
				id: "event-abc",
				title: "x",
				durationSec: 45,
			})
		).rejects.toThrow(/comes from an event/);
		expect(await savedXml(backend)).toBe(before);
	});

	it("reorders every slide and bumps the version", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		await asBoard.mutation(api.tvContent.reorderConfigSlides, {
			ids: ["event-abc", "a"],
		});
		expect(await slideIds(backend)).toEqual(["event-abc", "a"]);
		expect(await configVersion(backend)).toBe(4);
	});

	it("is a no-op when the order is unchanged: no version bump", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		await asBoard.mutation(api.tvContent.reorderConfigSlides, {
			ids: ["a", "event-abc"],
		});
		expect(await configVersion(backend)).toBe(3);
		expect(await buildJobs(backend)).toBe(0);
	});

	it("refuses a wrong id set and leaves the config alone", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		for (const ids of [
			["a"],
			["a", "a"],
			["a", "x"],
			["a", "event-abc", "x"],
		])
			await expect(
				asBoard.mutation(api.tvContent.reorderConfigSlides, { ids })
			).rejects.toThrow(/changed meanwhile/);
		expect(await slideIds(backend)).toEqual(["a", "event-abc"]);
		expect(await configVersion(backend)).toBe(3);
	});

	it("refuses a member and a signed-out caller", async () => {
		const { backend, asMember } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		const args = { ids: ["event-abc", "a"] };
		await expect(
			asMember.mutation(api.tvContent.reorderConfigSlides, args)
		).rejects.toThrow(/Forbidden/);
		await expect(
			backend.mutation(api.tvContent.reorderConfigSlides, args)
		).rejects.toThrow(/NotAuthenticated/);
		expect(await slideIds(backend)).toEqual(["a", "event-abc"]);
		expect(await configVersion(backend)).toBe(3);
	});
});

describe("move", () => {
	it("is a true no-op at the ends: no version bump, no build", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, TWO_SLIDES, 5);
		await asBoard.mutation(api.tvContent.moveConfigSlide, {
			id: "a",
			direction: "up",
		});
		await asBoard.mutation(api.tvContent.moveConfigSlide, {
			id: "b",
			direction: "down",
		});
		expect(await configVersion(backend)).toBe(5);
		expect(await buildJobs(backend)).toBe(0);
	});

	it("moves an event slide like any other", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 3);
		await asBoard.mutation(api.tvContent.moveConfigSlide, {
			id: "event-abc",
			direction: "up",
		});
		expect(await slideIds(backend)).toEqual(["event-abc", "a"]);
		expect(await configVersion(backend)).toBe(4);
	});
});

describe("saveConfigXml refusals", () => {
	it("refuses before the tvSlides migration has run", async () => {
		const { backend, asBoard } = await setup();
		await backend.run((context) =>
			context.db.insert("tvSlides", {
				title: "Old",
				kind: "html",
				htmlText: "<p>old</p>",
				durationSec: 15,
				position: 0,
				enabled: true,
				updatedAt: 1,
			})
		);
		await expect(
			asBoard.mutation(api.tvContent.saveConfigXml, {
				xml: serializeConfig({ transition: "fade", slides: [] }),
				expectedVersion: 0,
			})
		).rejects.toThrow(/being updated/);
		await expect(
			asBoard.mutation(api.tvContent.saveConfigXml, {
				xml: "<tv",
				expectedVersion: 0,
			})
		).rejects.toThrow(/being updated/);
		expect(await savedXml(backend)).toBeFalsy();
	});

	it("returns problems for a hand-added or hand-edited event entry", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG, 7);
		const added = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: serializeConfig({
				...EVENT_CONFIG,
				slides: [
					...EVENT_CONFIG.slides,
					{
						id: "event-zzz",
						type: "html",
						src: "slides/event-abc.html",
						duration: 20,
						enabled: true,
						source: "event",
						event: "zzz",
					},
				],
			}),
			expectedVersion: 7,
		});
		expect(added).toEqual({
			ok: false,
			problems: [expect.stringContaining("only events can add those")],
		});
		const edited = await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: serializeConfig({
				...EVENT_CONFIG,
				slides: [
					SLIDE_A,
					{
						...EVENT_CONFIG.slides[1],
						title: "Hijacked",
					},
				],
			}),
			expectedVersion: 7,
		});
		expect(edited.ok).toBe(false);
		expect(await savedXml(backend)).toBe(serializeConfig(EVENT_CONFIG));
		expect(await buildJobs(backend)).toBe(0);
	});
});

describe("one pack build per write", () => {
	it("setTransition schedules exactly one", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, EVENT_CONFIG);
		await asBoard.mutation(api.tv.setTransition, { transition: "none" });
		expect(await buildJobs(backend)).toBe(1);
	});

	it("update, move, remove and save schedule exactly one each", async () => {
		const { backend, asBoard } = await setup();
		await seedConfig(backend, TWO_SLIDES, 1);
		await asBoard.mutation(api.tvContent.updateConfigSlide, {
			id: "a",
			enabled: false,
		});
		expect(await buildJobs(backend)).toBe(1);
		await asBoard.mutation(api.tvContent.moveConfigSlide, {
			id: "b",
			direction: "up",
		});
		expect(await buildJobs(backend)).toBe(2);
		await asBoard.mutation(api.tvContent.removeConfigSlide, { id: "a" });
		expect(await buildJobs(backend)).toBe(3);
		const version = await configVersion(backend);
		await asBoard.mutation(api.tvContent.saveConfigXml, {
			xml: serializeConfig({ transition: "slide", slides: [] }),
			expectedVersion: version ?? 0,
		});
		expect(await buildJobs(backend)).toBe(4);
		expect(await configVersion(backend)).toBe(5);
	});
});

describe("legacy blob holders", () => {
	it("createSlide refuses an image a pack file holds", async () => {
		const { backend, asBoard } = await setup();
		await backend.run(async (context) => {
			const fileId = await context.storage.store(
				new Blob(["x"], { type: "image/png" })
			);
			await context.db.insert("tvAssets", {
				path: "assets/logo.png",
				fileId,
				size: 1,
				contentType: "image/png",
			});
		});
		const held = await firstAssetFileId(backend);
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "N",
				kind: "image",
				fileId: held,
			})
		).rejects.toThrow();
	});
});
