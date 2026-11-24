// PROD-GATED one-off: turns the legacy `tvSlides` rows into config.xml plus
// `tvAssets` files. A human runs it via the CLI (docs/DEPLOYMENT.md, "TV
// slideshow"): dry, then for real, then dry again. It never touches tvSlides;
// image blobs are copied, so every blob keeps exactly one holder (the legacy
// row holds its original, the pack file its copy) and the cleanup PR can
// delete the old rows and blobs without touching the pack.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
	type QueryCtx,
} from "./_generated/server";
import { invariant } from "./lib/result.ts";
import { assetHoldsBlob } from "./lib/tv/blobHeld.ts";
import { nextSlideId } from "./lib/tv/configEdits.ts";
import { writeConfig } from "./lib/tv/configStore.ts";
import {
	parseConfigXml,
	serializeConfig,
	type TvConfig,
	type TvConfigSlide,
} from "./lib/tv/configXml.ts";
import {
	TV_DEFAULT_TRANSITION,
	TV_LIMITS,
	TV_PACK_LIMITS,
} from "./lib/tv/constants.ts";
import { HTML_CONTENT_TYPE, imageExtension } from "./lib/tv/packPaths.ts";
import { slidesInOrder } from "./lib/tv/queries.ts";

type LegacySlide = {
	title: string;
	kind: "image" | "html";
	durationSec: number;
	enabled: boolean;
	htmlText?: string;
	fileId?: Id<"_storage">;
	contentType?: string;
	/** Bytes of the stored image; absent when there is no blob. */
	size?: number;
	/** A fileId is set but its blob is gone. */
	isBlobMissing?: boolean;
};

export type LegacyShow = {
	isMigrated: boolean;
	transition: TvConfig["transition"];
	slides: LegacySlide[];
};

type PlannedFile =
	| { path: string; size: number; html: string }
	| {
			path: string;
			size: number;
			fileId: Id<"_storage">;
			contentType: string;
	  };

function legacyExtension(slide: LegacySlide): string | undefined {
	return slide.kind === "html" ? "html" : imageExtension(slide.contentType);
}

function isComplete(slide: LegacySlide): boolean {
	if (legacyExtension(slide) === undefined) return false;
	return slide.kind === "html"
		? slide.htmlText !== undefined
		: slide.fileId !== undefined;
}

function plannedFile(slide: LegacySlide, path: string): PlannedFile | null {
	if (slide.kind === "html") {
		const html = slide.htmlText ?? "";
		return {
			path,
			size: new TextEncoder().encode(html).length,
			html,
		};
	}
	if (!slide.fileId) return null;
	return {
		path,
		size: slide.size ?? 0,
		fileId: slide.fileId,
		contentType: slide.contentType ?? "",
	};
}

/** Pure: the config and files the legacy slides become; incomplete slides are skipped by title. */
export function planMigration(legacy: LegacyShow): {
	config: TvConfig;
	files: PlannedFile[];
	skipped: string[];
	missingBlobs: string[];
} {
	const slides: TvConfigSlide[] = [];
	const files: PlannedFile[] = [];
	const skipped: string[] = [];
	const missingBlobs: string[] = [];
	for (const slide of legacy.slides) {
		if (slide.isBlobMissing) missingBlobs.push(slide.title);
		const id = nextSlideId({ transition: legacy.transition, slides });
		const source = `slides/${id}.${legacyExtension(slide) ?? ""}`;
		const file = isComplete(slide) ? plannedFile(slide, source) : null;
		if (!file) {
			skipped.push(slide.title);
			continue;
		}
		slides.push({
			id,
			type: slide.kind,
			src: source,
			duration: slide.durationSec,
			enabled: slide.enabled,
			title: slide.title,
		});
		files.push(file);
	}
	return {
		config: { transition: legacy.transition, slides },
		files,
		skipped,
		missingBlobs,
	};
}

type CopyOutcome = "not-sent" | "unknown" | "written" | "refused";

/** Whether the copied blobs may be deleted. Only a call whose answer was lost
 *  ("unknown") may have committed: then keep them if anything holds them, and
 *  also when the check itself fails (an orphan beats a broken slide). */
export async function shouldDeleteCopies(
	outcome: CopyOutcome,
	isHeld: () => Promise<boolean>
): Promise<boolean> {
	if (outcome === "written") return false;
	if (outcome !== "unknown") return true;
	try {
		return !(await isHeld());
	} catch {
		return false;
	}
}

/**
 * What the legacy show looked like when it was read. Every legacy board edit
 * bumps the config version; the row count, newest `updatedAt` and position sum
 * also catch a create, delete, move or content edit. A write after the snapshot
 * must be refused, or the edit is silently lost.
 */
async function legacyFingerprint(context: QueryCtx): Promise<string> {
	const config = await context.db.query("tvConfig").first();
	const rows = await slidesInOrder(context.db);
	return [
		config?.version ?? 0,
		rows.length,
		Math.max(0, ...rows.map((row) => row.updatedAt)),
		rows.reduce((sum, row) => sum + row.position, 0),
	].join(":");
}

export const legacyShow = internalQuery({
	args: {},
	handler: async (context): Promise<LegacyShow & { fingerprint: string }> => {
		const config = await context.db.query("tvConfig").first();
		const rows = await slidesInOrder(context.db);
		const slides = await Promise.all(
			rows.map(async (row) => {
				const meta = row.fileId
					? await context.db.system.get("_storage", row.fileId)
					: null;
				return {
					title: row.title,
					kind: row.kind,
					durationSec: row.durationSec,
					enabled: row.enabled,
					htmlText: row.htmlText,
					fileId: row.fileId,
					contentType: meta?.contentType,
					size: meta?.size,
					isBlobMissing: row.fileId !== undefined && !meta,
				};
			})
		);
		return {
			fingerprint: await legacyFingerprint(context),
			isMigrated: config?.xml !== undefined,
			transition: config?.transition ?? TV_DEFAULT_TRANSITION,
			slides,
		};
	},
});

/** True when a config exists or any tvAssets row holds one of these blobs. */
export const holdsCopies = internalQuery({
	args: { fileIds: v.array(v.id("_storage")) },
	handler: async (context, args): Promise<boolean> => {
		const config = await context.db.query("tvConfig").first();
		if (config?.xml !== undefined) return true;
		for (const fileId of args.fileIds) {
			if (await assetHoldsBlob(context, fileId)) return true;
		}
		return false;
	},
});

const storedFile = v.object({
	path: v.string(),
	fileId: v.id("_storage"),
	size: v.number(),
	contentType: v.string(),
});

type WriteOutcome = "written" | "configured" | "changed";

/** Nothing is written when a config was saved meanwhile ("configured") or a legacy edit landed after the snapshot ("changed"). */
export const writeMigratedConfig = internalMutation({
	args: {
		xml: v.string(),
		assets: v.array(storedFile),
		fingerprint: v.string(),
	},
	handler: async (context, args): Promise<WriteOutcome> => {
		const row = await context.db.query("tvConfig").first();
		if (row?.xml !== undefined) return "configured";
		if ((await legacyFingerprint(context)) !== args.fingerprint)
			return "changed";
		const parsed = parseConfigXml(args.xml);
		invariant(parsed.isOk(), "migration built XML that does not parse");
		for (const asset of args.assets)
			await context.db.insert("tvAssets", asset);
		await writeConfig(context, parsed.value);
		return "written";
	},
});

type MigrationReport = {
	status: "already-migrated" | "dry-run" | "migrated" | "changed";
	slides: number;
	skipped: string[];
	xml?: string;
	totalBytes?: number;
	/** Things to fix or know before the real run; empty when all is well. */
	problems?: string[];
};

function dryRunProblems(
	plan: ReturnType<typeof planMigration>,
	totalBytes: number,
	parsed: ReturnType<typeof parseConfigXml>
): string[] {
	const problems = plan.missingBlobs.map(
		(title) => `The image blob of "${title}" is missing; it is skipped.`
	);
	if (parsed.isErr())
		problems.push(
			`The generated config.xml does not parse: ${parsed.error.map((problem) => problem.message).join("; ")}`
		);
	if (totalBytes > TV_PACK_LIMITS.packMaxBytes)
		problems.push(
			`The files total ${String(totalBytes)} bytes, over the ${String(TV_PACK_LIMITS.packMaxBytes)} byte pack maximum.`
		);
	return problems;
}

/** Copies every file, then writes the config; says what the write did. */
async function copyAndWrite(
	context: ActionCtx,
	files: PlannedFile[],
	xml: string,
	fingerprint: string
): Promise<WriteOutcome> {
	const assets = [];
	let outcome: CopyOutcome = "not-sent";
	let written: WriteOutcome | undefined;
	try {
		// One file at a time: an image is read whole into memory.
		for (const file of files) {
			const blob =
				"html" in file
					? new Blob([file.html], { type: HTML_CONTENT_TYPE })
					: await context.storage.get(file.fileId);
			invariant(blob, `tvSlides blob missing for ${file.path}`);
			assets.push({
				path: file.path,
				size: blob.size,
				contentType:
					"html" in file ? HTML_CONTENT_TYPE : file.contentType,
				fileId: await context.storage.store(blob),
			});
		}
		outcome = "unknown";
		written = await context.runMutation(
			internal.migrateTvSlidesToConfig.writeMigratedConfig,
			{ xml, assets, fingerprint }
		);
		outcome = written === "written" ? "written" : "refused";
	} finally {
		// A failure or a config saved meanwhile must not leave orphaned copies,
		// but a lost answer from a committed write must not delete live ones.
		const fileIds = assets.map((asset) => asset.fileId);
		if (
			await shouldDeleteCopies(outcome, () =>
				context.runQuery(internal.migrateTvSlidesToConfig.holdsCopies, {
					fileIds,
				})
			)
		)
			for (const fileId of fileIds) await context.storage.delete(fileId);
	}
	invariant(written, "the migration write neither answered nor threw");
	return written;
}

export const migrateTvSlidesToConfig = internalAction({
	args: { dryRun: v.boolean() },
	handler: async (context, args): Promise<MigrationReport> => {
		const legacy = await context.runQuery(
			internal.migrateTvSlidesToConfig.legacyShow,
			{}
		);
		if (legacy.isMigrated)
			return { status: "already-migrated", slides: 0, skipped: [] };
		invariant(
			legacy.slides.length <= TV_LIMITS.maxSlides,
			`tvSlides holds more than ${String(TV_LIMITS.maxSlides)} rows; trim it first`
		);
		const plan = planMigration(legacy);
		const xml = serializeConfig(plan.config);
		const totalBytes = plan.files.reduce((sum, file) => sum + file.size, 0);
		const parsed = parseConfigXml(xml);
		const problems = dryRunProblems(plan, totalBytes, parsed);
		const report = {
			slides: plan.config.slides.length,
			skipped: plan.skipped,
			xml,
			totalBytes,
			problems,
		};
		if (args.dryRun) return { status: "dry-run", ...report };
		invariant(parsed.isOk(), "migration built XML that does not parse");
		const written = await copyAndWrite(
			context,
			plan.files,
			xml,
			legacy.fingerprint
		);
		if (written === "written") return { status: "migrated", ...report };
		if (written === "changed")
			return {
				status: "changed",
				slides: 0,
				skipped: [],
				problems: [
					"The legacy slides changed during the run, nothing was migrated. Run it again.",
				],
			};
		return { status: "already-migrated", slides: 0, skipped: [] };
	},
});
