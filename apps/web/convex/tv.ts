import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { eventHoldsBlob } from "./lib/tv/blobHeld.ts";
import { boardUploadUrl, discardUnheldUpload } from "./lib/tv/boardUpload.ts";
import { checkImage } from "./lib/tv/checkImage.ts";
import {
	TV_DEFAULT_TRANSITION,
	TV_INITIAL_VERSION,
	TV_LIMITS,
} from "./lib/tv/constants.ts";
import { htmlBytes } from "./lib/tv/htmlBytes.ts";
import {
	liveDevices,
	livePairings,
	readTvConfig,
	slidesInOrder,
} from "./lib/tv/queries.ts";
import { hashTvSecret } from "./lib/tv/tokens.ts";
import { NAME_MAX, checkLength } from "./lib/validate.ts";

async function pairingForCode(
	context: QueryCtx,
	code: string
): Promise<Doc<"tvPairings"> | null> {
	const codeHash = await hashTvSecret(code);
	return context.db
		.query("tvPairings")
		.withIndex("by_codeHash", (range) => range.eq("codeHash", codeHash))
		.first();
}

/** Board-only: the state of the pairing a QR code points at. */
export const pairingStatus = query({
	args: { code: v.string() },
	handler: async (
		context,
		args
	): Promise<"pending" | "expired" | "used" | "unknown"> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const row = await pairingForCode(context, args.code);
		if (!row) return "unknown";
		if (row.approved === true) return "used";
		return row.expiresAt <= Date.now() ? "expired" : "pending";
	},
});

/** Board-only: approve the pairing a TV started, naming the TV. */
export const approvePairing = mutation({
	args: { code: v.string(), label: v.string() },
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(args.label, NAME_MAX));
		const label = args.label.trim();
		if (label === "") refuse({ type: "TvPairingInvalid" });
		const row = await pairingForCode(context, args.code);
		if (!row) refuse({ type: "TvPairingInvalid" });
		if (row.approved === true) refuse({ type: "TvPairingUsed" });
		if (row.expiresAt <= Date.now()) refuse({ type: "TvPairingExpired" });
		const active = await liveDevices(context.db);
		// An approved pairing is not a device until its TV claims it, so it
		// holds a slot too; otherwise sequential approvals overshoot the cap.
		const now = Date.now();
		const pairings = await livePairings(context.db, now);
		const reserved = pairings.filter(
			(pairing) =>
				pairing.approved === true && pairing.deviceId === undefined
		).length;
		if (active.length + reserved >= TV_LIMITS.maxDevices)
			refuse({ type: "TvTooManyDevices" });
		await context.db.patch(row._id, { label, approved: true });
	},
});

/** Live TVs always list; this many recent revoked ones are shown beside them. */
const REVOKED_LISTED = 20;

const slideKind = v.union(v.literal("image"), v.literal("html"));
const transitionValue = v.union(
	v.literal("fade"),
	v.literal("slide"),
	v.literal("none")
);

/** The singleton config row, inserted on first use. */
async function ensureConfig(context: MutationCtx): Promise<Doc<"tvConfig">> {
	const existing = await context.db.query("tvConfig").first();
	if (existing) return existing;
	const id = await context.db.insert("tvConfig", {
		transition: TV_DEFAULT_TRANSITION,
		version: TV_INITIAL_VERSION,
	});
	const created = await context.db.get(id);
	invariant(created, "tvConfig row missing right after insert");
	return created;
}

/** Every slide/config change calls this so the TV's poll sees it. */
async function bumpVersion(context: MutationCtx): Promise<void> {
	const config = await ensureConfig(context);
	await context.db.patch(config._id, { version: config.version + 1 });
}

/**
 * Refuse a blob another slide or an event already holds (deleting one would
 * break both).
 */
async function refuseHeldFile(
	context: QueryCtx,
	slides: Doc<"tvSlides">[],
	fileId: Id<"_storage">,
	exceptId?: Id<"tvSlides">
): Promise<void> {
	if (
		slides.some(
			(slide) => slide.fileId === fileId && slide._id !== exceptId
		) ||
		(await eventHoldsBlob(context, fileId))
	)
		refuse({ type: "TvImageInvalid" });
}

function checkDuration(seconds: number): void {
	if (
		!Number.isInteger(seconds) ||
		seconds < TV_LIMITS.durationMin ||
		seconds > TV_LIMITS.durationMax
	)
		refuse({ type: "TvSlideInvalid" });
}

/** `others` are the slides this body sits beside (not the one being edited). */
function checkHtml(htmlText: string, others: Doc<"tvSlides">[]): void {
	if (htmlText.trim() === "") refuse({ type: "TvSlideInvalid" });
	const bytes = htmlBytes(htmlText);
	const total = others.reduce(
		(sum, slide) => sum + htmlBytes(slide.htmlText ?? ""),
		bytes
	);
	if (bytes > TV_LIMITS.htmlMax || total > TV_LIMITS.htmlTotalMax)
		refuse({ type: "TvHtmlTooLarge" });
}

function cleanTitle(title: string): string {
	unwrap(checkLength(title, NAME_MAX));
	const clean = title.trim();
	if (clean === "") refuse({ type: "TvSlideInvalid" });
	return clean;
}

async function slideOrRefuse(
	context: QueryCtx,
	id: Id<"tvSlides">
): Promise<Doc<"tvSlides">> {
	const slide = await context.db.get(id);
	if (!slide) refuse({ type: "TvSlideNotFound" });
	return slide;
}

function summary(slide: Doc<"tvSlides">) {
	return {
		_id: slide._id,
		title: slide.title,
		kind: slide.kind,
		durationSec: slide.durationSec,
		position: slide.position,
		enabled: slide.enabled,
		hasFile: slide.fileId !== undefined,
		...(slide.htmlText === undefined
			? {}
			: { htmlLength: htmlBytes(slide.htmlText) }),
	};
}

/** Board-only: every slide in show order, without the HTML bodies. */
export const listSlides = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const slides = await slidesInOrder(context.db);
		return slides.map((slide) => summary(slide));
	},
});

/** Board-only: one slide, with its HTML body. */
export const getSlide = query({
	args: { id: v.id("tvSlides") },
	handler: async (context, args) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const slide = await slideOrRefuse(context, args.id);
		return { ...summary(slide), htmlText: slide.htmlText };
	},
});

/** Board-only: a one-shot URL to upload a slide image to. */
export const generateUploadUrl = mutation({
	args: {},
	handler: (context): Promise<string> => boardUploadUrl(context),
});

/**
 * Board-only: delete an uploaded blob a slide was refused for. A no-op when
 * a slide or an event holds it.
 */
export const discardUpload = mutation({
	args: { fileId: v.id("_storage") },
	handler: (context, { fileId }): Promise<void> =>
		discardUnheldUpload(context, fileId),
});

/** Board-only: add a slide at the end of the show. */
export const createSlide = mutation({
	args: {
		title: v.string(),
		kind: slideKind,
		htmlText: v.optional(v.string()),
		fileId: v.optional(v.id("_storage")),
		durationSec: v.optional(v.number()),
	},
	handler: async (context, args): Promise<Id<"tvSlides">> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const title = cleanTitle(args.title);
		const durationSec = args.durationSec ?? TV_LIMITS.durationDefault;
		checkDuration(durationSec);
		const existing = await slidesInOrder(context.db);
		if (args.kind === "html") {
			if (args.htmlText === undefined || args.fileId !== undefined)
				refuse({ type: "TvSlideInvalid" });
			checkHtml(args.htmlText, existing);
		} else {
			if (args.fileId === undefined || args.htmlText !== undefined)
				refuse({ type: "TvSlideInvalid" });
			await checkImage(context, args.fileId);
		}
		if (existing.length >= TV_LIMITS.maxSlides)
			refuse({ type: "TvTooManySlides" });
		if (args.fileId !== undefined)
			await refuseHeldFile(context, existing, args.fileId);
		const last = existing.at(-1);
		const id = await context.db.insert("tvSlides", {
			title,
			kind: args.kind,
			htmlText: args.htmlText,
			fileId: args.fileId,
			durationSec,
			position: last ? last.position + 1 : 0,
			enabled: true,
			updatedAt: Date.now(),
		});
		await bumpVersion(context);
		return id;
	},
});

/**
 * Validates a slide edit's HTML or image and returns the content part of the
 * patch. Only a
 * real change to either bumps `updatedAt`, the manifest `rev` the TV
 * re-downloads on: a title, duration or enabled edit must not.
 */
async function applyContent(
	context: MutationCtx,
	current: { slide: Doc<"tvSlides">; slides: Doc<"tvSlides">[] },
	args: { htmlText?: string; fileId?: Id<"_storage"> }
): Promise<Partial<Doc<"tvSlides">>> {
	const { slide, slides } = current;
	const isWrongKind =
		(args.htmlText !== undefined && slide.kind !== "html") ||
		(args.fileId !== undefined && slide.kind !== "image");
	if (isWrongKind) refuse({ type: "TvSlideInvalid" });
	if (args.htmlText !== undefined) {
		checkHtml(
			args.htmlText,
			slides.filter((other) => other._id !== slide._id)
		);
		return args.htmlText === slide.htmlText
			? {}
			: { htmlText: args.htmlText, updatedAt: Date.now() };
	}
	if (args.fileId === undefined || args.fileId === slide.fileId) return {};
	await checkImage(context, args.fileId);
	await refuseHeldFile(context, slides, args.fileId, slide._id);
	if (slide.fileId) await context.storage.delete(slide.fileId);
	return { fileId: args.fileId, updatedAt: Date.now() };
}

/** Board-only: edit a slide. A replaced image's old blob is deleted. */
export const updateSlide = mutation({
	args: {
		id: v.id("tvSlides"),
		title: v.optional(v.string()),
		htmlText: v.optional(v.string()),
		fileId: v.optional(v.id("_storage")),
		durationSec: v.optional(v.number()),
		enabled: v.optional(v.boolean()),
	},
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const slide = await slideOrRefuse(context, args.id);
		const slides = await slidesInOrder(context.db);
		const patch = await applyContent(context, { slide, slides }, args);
		if (args.title !== undefined) patch.title = cleanTitle(args.title);
		if (args.durationSec !== undefined) {
			checkDuration(args.durationSec);
			patch.durationSec = args.durationSec;
		}
		if (args.enabled !== undefined) patch.enabled = args.enabled;
		await context.db.patch(slide._id, patch);
		await bumpVersion(context);
	},
});

/** Board-only: remove a slide and its image blob. */
export const deleteSlide = mutation({
	args: { id: v.id("tvSlides") },
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const slide = await slideOrRefuse(context, args.id);
		if (slide.fileId) await context.storage.delete(slide.fileId);
		await context.db.delete(slide._id);
		await bumpVersion(context);
	},
});

/** Board-only: swap a slide with its neighbour; a no-op at the ends. */
export const moveSlide = mutation({
	args: {
		id: v.id("tvSlides"),
		direction: v.union(v.literal("up"), v.literal("down")),
	},
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const slide = await slideOrRefuse(context, args.id);
		const neighbour =
			args.direction === "up"
				? await context.db
						.query("tvSlides")
						.withIndex("by_position", (range) =>
							range.lt("position", slide.position)
						)
						.order("desc")
						.first()
				: await context.db
						.query("tvSlides")
						.withIndex("by_position", (range) =>
							range.gt("position", slide.position)
						)
						.first();
		if (!neighbour) return;
		await context.db.patch(slide._id, { position: neighbour.position });
		await context.db.patch(neighbour._id, { position: slide.position });
		await bumpVersion(context);
	},
});

/** Board-only: the slideshow settings. */
export const getConfig = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		return readTvConfig(context.db);
	},
});

/** Board-only: choose how slides change. */
export const setTransition = mutation({
	args: { transition: transitionValue },
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const config = await ensureConfig(context);
		await context.db.patch(config._id, {
			transition: args.transition,
			version: config.version + 1,
		});
	},
});

/**
 * Board-only: the paired TVs: every live one plus the latest revoked ones.
 * Device rows hold no person reference, so erasing a board member cannot affect this.
 */
export const listDevices = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const live = await liveDevices(context.db);
		const revoked = await context.db
			.query("tvDevices")
			.filter((range) => range.neq(range.field("revokedAt"), undefined))
			.order("desc")
			.take(REVOKED_LISTED);
		const devices = [...live, ...revoked].toSorted(
			(left, right) => right._creationTime - left._creationTime
		);
		return devices.map((device) => ({
			_id: device._id,
			label: device.label,
			createdAt: device.createdAt,
			lastSeenAt: device.lastSeenAt,
			revokedAt: device.revokedAt,
		}));
	},
});

/** Board-only: cut a TV off. Its token stops working; the row stays listed. */
export const revokeDevice = mutation({
	args: { id: v.id("tvDevices") },
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const device = await context.db.get(args.id);
		if (!device) refuse({ type: "TvDeviceNotFound" });
		if (device.revokedAt === undefined)
			await context.db.patch(device._id, { revokedAt: Date.now() });
	},
});

/** Board-only: what the TV would show now (enabled slides, in order). */
export const previewSlides = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { transition } = await readTvConfig(context.db);
		const slides = await slidesInOrder(context.db);
		const shown = await Promise.all(
			slides
				.filter((slide) => slide.enabled)
				.map(async (slide) => ({
					id: slide._id,
					title: slide.title,
					kind: slide.kind,
					durationSec: slide.durationSec,
					html: slide.kind === "html" ? slide.htmlText : undefined,
					imageUrl: slide.fileId
						? ((await context.storage.getUrl(slide.fileId)) ??
							undefined)
						: undefined,
				}))
		);
		return {
			transition,
			slides: shown,
		};
	},
});
