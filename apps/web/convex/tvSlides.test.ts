/* eslint-disable @typescript-eslint/no-deprecated -- these tests exercise the legacy tvSlides mutations on purpose, until the cleanup PR removes them */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TV_LIMITS } from "./lib/tv/constants.ts";
import { hashTvSecret } from "./lib/tv/tokens.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function makeBackend() {
	return convexTest(schema, modules);
}

type Backend = ReturnType<typeof makeBackend>;

async function seedPerson(
	backend: Backend,
	email: string,
	tier: "member" | "board"
) {
	const id = await backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Test",
			lastName: "Person",
			tier,
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { id, as: backend.withIdentity({ email }) };
}

async function setup() {
	const backend = makeBackend();
	const board = await seedPerson(backend, "board@example.com", "board");
	const member = await seedPerson(backend, "member@example.com", "member");
	return { backend, board, asBoard: board.as, asMember: member.as };
}

function store(backend: Backend, type: string, size = 10) {
	return backend.run((context) =>
		context.storage.store(new Blob([new Uint8Array(size)], { type }))
	);
}

function blobUrl(backend: Backend, id: Id<"_storage">) {
	return backend.run((context) => context.storage.getUrl(id));
}

function version(backend: Backend) {
	return backend.run(async (context) => {
		const config = await context.db.query("tvConfig").first();
		return config?.version ?? 0;
	});
}

type Board = Awaited<ReturnType<typeof setup>>["asBoard"];

function html(
	as: Board,
	title = "Hello",
	extra: { durationSec?: number } = {}
) {
	return as.mutation(api.tv.createSlide, {
		title,
		kind: "html",
		htmlText: "<p>x</p>",
		...extra,
	});
}

describe("tv slides: access", () => {
	it.each([
		["listSlides", (client: Board) => client.query(api.tv.listSlides, {})],
		[
			"createSlide",
			(client: Board) =>
				client.mutation(api.tv.createSlide, {
					title: "A",
					kind: "html",
					htmlText: "<p>x</p>",
				}),
		],
		[
			"generateUploadUrl",
			(client: Board) => client.mutation(api.tv.generateUploadUrl, {}),
		],
		[
			"listDevices",
			(client: Board) => client.query(api.tv.listDevices, {}),
		],
		[
			"previewSlides",
			(client: Board) => client.query(api.tv.previewSlides, {}),
		],
	])("%s refuses a member and a logged-out caller", async (_name, call) => {
		const { backend, asMember } = await setup();
		await expect(call(asMember)).rejects.toThrow("Forbidden");
		await expect(call(backend as unknown as Board)).rejects.toThrow(
			"NotAuthenticated"
		);
	});
});

describe("tv slides: createSlide", () => {
	it("stores a trimmed title, appends after the last, defaults to 15s and bumps the version", async () => {
		const { backend, asBoard } = await setup();
		const first = await html(asBoard, "  First  ");
		const before = await version(backend);
		const second = await html(asBoard, "Second");
		expect(await version(backend)).toBe(before + 1);
		const list = await asBoard.query(api.tv.listSlides, {});
		expect(list.map((slide) => slide._id)).toEqual([first, second]);
		expect(list[0]).toMatchObject({
			title: "First",
			durationSec: 15,
			enabled: true,
			hasFile: false,
		});
		expect(list[1].position).toBe(list[0].position + 1);
	});

	it("refuses a blank title", async () => {
		const { asBoard } = await setup();
		await expect(html(asBoard, "   ")).rejects.toThrow("TvSlideInvalid");
	});

	it("refuses html over the limit", async () => {
		const { asBoard } = await setup();
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "Big",
				kind: "html",
				htmlText: "x".repeat(TV_LIMITS.htmlMax + 1),
			})
		).rejects.toThrow("TvHtmlTooLarge");
	});

	it("measures html in UTF-8 bytes: multibyte text under the character cap is refused", async () => {
		const { asBoard } = await setup();
		const htmlText = "é".repeat(TV_LIMITS.htmlMax / 2 + 1);
		expect(htmlText.length).toBeLessThan(TV_LIMITS.htmlMax);
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "Wide",
				kind: "html",
				htmlText,
			})
		).rejects.toThrow("TvHtmlTooLarge");
	});

	it("accepts html exactly at the byte cap", async () => {
		const { asBoard } = await setup();
		const id = await asBoard.mutation(api.tv.createSlide, {
			title: "Full",
			kind: "html",
			htmlText: "x".repeat(TV_LIMITS.htmlMax),
		});
		expect(id).toBeTruthy();
	});

	it("refuses html that pushes all slides over the total cap, on create and on update", async () => {
		const { asBoard } = await setup();
		const full = "x".repeat(TV_LIMITS.htmlMax);
		const fits = Math.floor(TV_LIMITS.htmlTotalMax / TV_LIMITS.htmlMax);
		const ids = [];
		for (let index = 0; index < fits; index++)
			ids.push(
				await asBoard.mutation(api.tv.createSlide, {
					title: `Full ${String(index)}`,
					kind: "html",
					htmlText: full,
				})
			);
		const spare = TV_LIMITS.htmlTotalMax - fits * TV_LIMITS.htmlMax;
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "Over",
				kind: "html",
				htmlText: "x".repeat(spare + 1),
			})
		).rejects.toThrow("TvHtmlTooLarge");
		await asBoard.mutation(api.tv.createSlide, {
			title: "Exactly",
			kind: "html",
			htmlText: "x".repeat(spare),
		});
		await expect(
			asBoard.mutation(api.tv.updateSlide, {
				id: ids[0],
				htmlText: `${full}y`,
			})
		).rejects.toThrow("TvHtmlTooLarge");
		await asBoard.mutation(api.tv.updateSlide, {
			id: ids[0],
			htmlText: "x",
		});
	});

	it.each([4, 301])("refuses a duration of %i", async (durationSec) => {
		const { asBoard } = await setup();
		await expect(html(asBoard, "D", { durationSec })).rejects.toThrow(
			"TvSlideInvalid"
		);
	});

	it("accepts the duration bounds", async () => {
		const { asBoard } = await setup();
		await html(asBoard, "Low", { durationSec: 5 });
		await html(asBoard, "High", { durationSec: 300 });
		const list = await asBoard.query(api.tv.listSlides, {});
		expect(list.map((slide) => slide.durationSec)).toEqual([5, 300]);
	});

	it("refuses html without htmlText and image without fileId", async () => {
		const { asBoard } = await setup();
		await expect(
			asBoard.mutation(api.tv.createSlide, { title: "A", kind: "html" })
		).rejects.toThrow("TvSlideInvalid");
		await expect(
			asBoard.mutation(api.tv.createSlide, { title: "A", kind: "image" })
		).rejects.toThrow("TvSlideInvalid");
	});

	it("accepts the 50th slide and refuses the 51st", async () => {
		const { backend, asBoard } = await setup();
		await backend.run(async (context) => {
			for (let index = 0; index < TV_LIMITS.maxSlides - 1; index++)
				await context.db.insert("tvSlides", {
					title: `S${index}`,
					kind: "html",
					htmlText: "<p>x</p>",
					durationSec: 15,
					position: index,
					enabled: true,
					updatedAt: 0,
				});
		});
		await html(asBoard, "Fiftieth");
		await expect(html(asBoard, "One too many")).rejects.toThrow(
			"TvTooManySlides"
		);
	});
});

describe("tv slides: images", () => {
	it("refuses an svg", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/svg+xml");
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "Img",
				kind: "image",
				fileId,
			})
		).rejects.toThrow("TvImageInvalid");
	});

	it("refuses an image over 8 MB", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(
			backend,
			"image/png",
			TV_LIMITS.imageMaxBytes + 1
		);
		await expect(
			asBoard.mutation(api.tv.createSlide, {
				title: "Img",
				kind: "image",
				fileId,
			})
		).rejects.toThrow("TvImageInvalid");
	});

	it("accepts a png", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		const id = await asBoard.mutation(api.tv.createSlide, {
			title: "Img",
			kind: "image",
			fileId,
		});
		const slide = await asBoard.query(api.tv.getSlide, { id });
		expect(slide).toMatchObject({ kind: "image", hasFile: true });
		expect(await blobUrl(backend, fileId)).not.toBeNull();
	});

	it("updateSlide replacing the image deletes the old blob", async () => {
		const { backend, asBoard } = await setup();
		const oldId = await store(backend, "image/png");
		const newId = await store(backend, "image/jpeg");
		const id = await asBoard.mutation(api.tv.createSlide, {
			title: "Img",
			kind: "image",
			fileId: oldId,
		});
		await asBoard.mutation(api.tv.updateSlide, { id, fileId: newId });
		expect(await blobUrl(backend, oldId)).toBeNull();
		expect(await blobUrl(backend, newId)).not.toBeNull();
	});

	it("deleteSlide deletes the blob", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		const id = await asBoard.mutation(api.tv.createSlide, {
			title: "Img",
			kind: "image",
			fileId,
		});
		await asBoard.mutation(api.tv.deleteSlide, { id });
		expect(await blobUrl(backend, fileId)).toBeNull();
		expect(await asBoard.query(api.tv.listSlides, {})).toEqual([]);
	});
});

function imageArgs(fileId: Id<"_storage">, title = "Img") {
	return { title, kind: "image" as const, fileId };
}

async function holdAsEventPicture(asBoard: Board, fileId: Id<"_storage">) {
	const eventId = await asBoard.mutation(api.events.createEvent, {
		name: "Demo night",
		startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
		endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
	});
	await asBoard.mutation(api.events.updateEvent, {
		eventId,
		pictureId: fileId,
	});
	return eventId;
}

describe("tv slides: uploads", () => {
	it("discardUpload deletes an unreferenced blob", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/svg+xml");
		await expect(
			asBoard.mutation(api.tv.createSlide, imageArgs(fileId))
		).rejects.toThrow("TvImageInvalid");
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(await blobUrl(backend, fileId)).toBeNull();
	});

	it("discardUpload tolerates a blob that is already gone", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		await backend.run(async (context) => {
			await context.storage.delete(fileId);
		});
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(await blobUrl(backend, fileId)).toBeNull();
	});

	it("discardUpload leaves a blob a slide references", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		await asBoard.mutation(api.tv.createSlide, imageArgs(fileId));
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(await blobUrl(backend, fileId)).not.toBeNull();
	});

	it("discardUpload leaves a blob an event picture holds", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		await holdAsEventPicture(asBoard, fileId);
		await asBoard.mutation(api.tv.discardUpload, { fileId });
		expect(await blobUrl(backend, fileId)).not.toBeNull();
	});

	it("discardUpload refuses a member and a logged-out caller", async () => {
		const { backend, asMember } = await setup();
		const fileId = await store(backend, "image/png");
		await expect(
			asMember.mutation(api.tv.discardUpload, { fileId })
		).rejects.toThrow("Forbidden");
		await expect(
			(backend as unknown as Board).mutation(api.tv.discardUpload, {
				fileId,
			})
		).rejects.toThrow("NotAuthenticated");
		expect(await blobUrl(backend, fileId)).not.toBeNull();
	});

	it("createSlide refuses a file another slide holds", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		await asBoard.mutation(api.tv.createSlide, imageArgs(fileId));
		await expect(
			asBoard.mutation(api.tv.createSlide, imageArgs(fileId, "Copy"))
		).rejects.toThrow("TvImageInvalid");
		expect(await asBoard.query(api.tv.listSlides, {})).toHaveLength(1);
	});

	it("updateSlide refuses a file another slide holds, keeping its own", async () => {
		const { backend, asBoard } = await setup();
		const fileA = await store(backend, "image/png");
		const fileB = await store(backend, "image/png");
		await asBoard.mutation(api.tv.createSlide, imageArgs(fileA, "A"));
		const slideB = await asBoard.mutation(
			api.tv.createSlide,
			imageArgs(fileB, "B")
		);
		await expect(
			asBoard.mutation(api.tv.updateSlide, { id: slideB, fileId: fileA })
		).rejects.toThrow("TvImageInvalid");
		expect(await blobUrl(backend, fileB)).not.toBeNull();
		await asBoard.mutation(api.tv.updateSlide, {
			id: slideB,
			fileId: fileB,
		});
	});

	it("createSlide and updateSlide refuse a file an event holds", async () => {
		const { backend, asBoard } = await setup();
		const eventFile = await store(backend, "image/png");
		const eventId = await holdAsEventPicture(asBoard, eventFile);
		await expect(
			asBoard.mutation(api.tv.createSlide, imageArgs(eventFile))
		).rejects.toThrow("TvImageInvalid");
		const own = await store(backend, "image/png");
		const slide = await asBoard.mutation(
			api.tv.createSlide,
			imageArgs(own)
		);
		await expect(
			asBoard.mutation(api.tv.updateSlide, {
				id: slide,
				fileId: eventFile,
			})
		).rejects.toThrow("TvImageInvalid");
		expect(await blobUrl(backend, eventFile)).not.toBeNull();
		expect(await blobUrl(backend, own)).not.toBeNull();
		expect(
			await asBoard.query(api.events.getEventPictureUrl, { eventId })
		).not.toBeNull();
	});

	it("updateSlide refuses htmlText on an image slide and fileId on an html slide", async () => {
		const { backend, asBoard } = await setup();
		const fileId = await store(backend, "image/png");
		const image = await asBoard.mutation(
			api.tv.createSlide,
			imageArgs(fileId)
		);
		const page = await html(asBoard, "Page");
		const other = await store(backend, "image/png");
		await expect(
			asBoard.mutation(api.tv.updateSlide, {
				id: image,
				htmlText: "<p>y</p>",
			})
		).rejects.toThrow("TvSlideInvalid");
		await expect(
			asBoard.mutation(api.tv.updateSlide, { id: page, fileId: other })
		).rejects.toThrow("TvSlideInvalid");
	});
});

describe("tv slides: order and preview", () => {
	it("moveSlide swaps with the neighbour and is a no-op at the ends", async () => {
		const { backend, asBoard } = await setup();
		const slideA = await html(asBoard, "A");
		const slideB = await html(asBoard, "B");
		const slideC = await html(asBoard, "C");
		async function order() {
			const list = await asBoard.query(api.tv.listSlides, {});
			return list.map((slide) => slide.title);
		}

		await asBoard.mutation(api.tv.moveSlide, {
			id: slideB,
			direction: "up",
		});
		expect(await order()).toEqual(["B", "A", "C"]);
		await asBoard.mutation(api.tv.moveSlide, {
			id: slideB,
			direction: "up",
		});
		expect(await order()).toEqual(["B", "A", "C"]);
		const beforeNoop = await version(backend);
		await asBoard.mutation(api.tv.moveSlide, {
			id: slideC,
			direction: "down",
		});
		expect(await order()).toEqual(["B", "A", "C"]);
		expect(await version(backend)).toBe(beforeNoop);
		await asBoard.mutation(api.tv.moveSlide, {
			id: slideA,
			direction: "down",
		});
		expect(await order()).toEqual(["B", "C", "A"]);
	});

	it("previewSlides omits disabled slides, keeps order and resolves image urls", async () => {
		const { backend, asBoard } = await setup();
		await html(asBoard, "A");
		const off = await html(asBoard, "Off");
		const fileId = await store(backend, "image/png");
		const img = await asBoard.mutation(api.tv.createSlide, {
			title: "Img",
			kind: "image",
			fileId,
		});
		await asBoard.mutation(api.tv.updateSlide, { id: off, enabled: false });
		await asBoard.mutation(api.tv.moveSlide, { id: img, direction: "up" });
		await asBoard.mutation(api.tv.moveSlide, { id: img, direction: "up" });
		await asBoard.mutation(api.tv.setTransition, { transition: "slide" });
		const preview = await asBoard.query(api.tv.previewSlides, {});
		expect(preview.transition).toBe("slide");
		expect(preview.slides.map((slide) => slide.title)).toEqual([
			"Img",
			"A",
		]);
		expect(preview.slides[0].imageUrl).toBeTypeOf("string");
		expect(preview.slides[1].html).toBe("<p>x</p>");
	});
});

async function seedDevices(backend: Backend, count: number) {
	return backend.run(async (context) => {
		const ids: Id<"tvDevices">[] = [];
		for (let index = 0; index < count; index++)
			ids.push(
				await context.db.insert("tvDevices", {
					tokenHash: `hash-${index}`,
					label: `TV ${index}`,
					createdAt: index,
				})
			);
		return ids;
	});
}

describe("tv slides: rev", () => {
	it("bumps rev (updatedAt) only when the html or image changes, but always the config version", async () => {
		const { backend, asBoard } = await setup();
		const id = await html(asBoard, "Rev");
		async function rev() {
			const row = await backend.run((context) => context.db.get(id));
			return row?.updatedAt;
		}
		await backend.run((context) => context.db.patch(id, { updatedAt: 1 }));
		const before = await version(backend);
		await asBoard.mutation(api.tv.updateSlide, {
			id,
			title: "Renamed",
			durationSec: 30,
			enabled: false,
		});
		expect(await rev()).toBe(1);
		expect(await version(backend)).toBe(before + 1);
		await asBoard.mutation(api.tv.updateSlide, {
			id,
			htmlText: "<p>x</p>",
		});
		expect(await rev()).toBe(1);
		await asBoard.mutation(api.tv.updateSlide, {
			id,
			htmlText: "<p>y</p>",
		});
		expect(await rev()).toBeGreaterThan(1);
	});

	it("bumps rev when the image is replaced", async () => {
		const { backend, asBoard } = await setup();
		const first = await store(backend, "image/png");
		const id = await asBoard.mutation(api.tv.createSlide, {
			title: "Img",
			kind: "image",
			fileId: first,
		});
		await backend.run((context) => context.db.patch(id, { updatedAt: 1 }));
		await asBoard.mutation(api.tv.updateSlide, {
			id,
			fileId: await store(backend, "image/png"),
		});
		const row = await backend.run((context) => context.db.get(id));
		expect(row?.updatedAt).toBeGreaterThan(1);
	});
});

describe("tv devices", () => {
	it("revokeDevice sets revokedAt and the device is still listed", async () => {
		const { backend, asBoard } = await setup();
		const [id] = await seedDevices(backend, 1);
		await asBoard.mutation(api.tv.revokeDevice, { id });
		const list = await asBoard.query(api.tv.listDevices, {});
		expect(list).toHaveLength(1);
		expect(list[0].revokedAt).toBeTypeOf("number");
	});

	it("a revoked device frees its slot for approvePairing", async () => {
		const { backend, asBoard } = await setup();
		const ids = await seedDevices(backend, TV_LIMITS.maxDevices);
		const code = "pair-code";
		await backend.run(async (context) => {
			await context.db.insert("tvPairings", {
				codeHash: await hashTvSecret(code),
				pollSecretHash: "ps2",
				expiresAt: Date.now() + 60_000,
			});
		});
		await expect(
			asBoard.mutation(api.tv.approvePairing, { code, label: "New" })
		).rejects.toThrow("TvTooManyDevices");
		await asBoard.mutation(api.tv.revokeDevice, { id: ids[0] });
		await asBoard.mutation(api.tv.approvePairing, { code, label: "New" });
	});

	it("listDevices keeps an old live device when 25 newer ones are revoked", async () => {
		const { backend, asBoard } = await setup();
		const [live] = await seedDevices(backend, 1);
		const revoked = await seedDevices(backend, 25);
		await backend.run(async (context) => {
			for (const id of revoked)
				await context.db.patch(id, { revokedAt: 1 });
		});
		const list = await asBoard.query(api.tv.listDevices, {});
		expect(list.map((device) => device._id)).toContain(live);
		expect(
			list.filter((device) => device.revokedAt !== undefined)
		).toHaveLength(20);
		expect(list).toHaveLength(21);
	});

	it("a device row and a pairing row hold no person reference", async () => {
		const { backend } = await setup();
		const [id] = await seedDevices(backend, 1);
		const pairingId = await backend.run((context) =>
			context.db.insert("tvPairings", {
				codeHash: "c",
				pollSecretHash: "p",
				expiresAt: 1,
				approved: true,
			})
		);
		await backend.run(async (context) => {
			const device = await context.db.get(id);
			const pairing = await context.db.get(pairingId);
			expect(
				Object.keys(device!).toSorted((left, right) =>
					left.localeCompare(right)
				)
			).toEqual(
				[
					"_creationTime",
					"_id",
					"createdAt",
					"label",
					"tokenHash",
				].toSorted((left, right) => left.localeCompare(right))
			);
			expect(pairing!.approved).toBe(true);
			expect(Object.keys(pairing!)).not.toContain("approvedBy");
		});
	});
});

describe("tv config", () => {
	it("setTransition rejects values outside the union and bumps the version", async () => {
		const { backend, asBoard } = await setup();
		await expect(
			asBoard.mutation(api.tv.setTransition, {
				transition: "spin" as unknown as "fade",
			})
		).rejects.toThrow();
		expect(await version(backend)).toBe(0);
		await asBoard.mutation(api.tv.setTransition, { transition: "none" });
		expect(await asBoard.query(api.tv.getConfig, {})).toEqual({
			transition: "none",
			version: 1,
		});
	});
});
