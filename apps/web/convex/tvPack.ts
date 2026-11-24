"use node";
// Node runtime for its memory, not for Node APIs: zipping or unzipping a
// 40 MiB pack in memory does not fit the default runtime's action limit.
// Exports actions only; the database side is in `tvPackInternal.ts`.
import { type FunctionReturnType } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx, internalAction } from "./_generated/server";
import { invariant } from "./lib/result.ts";
import { isPackSizeOk } from "./lib/tv/configStore.ts";
import { serializeConfig } from "./lib/tv/configXml.ts";
import {
	TV_PACK_LIMITS,
	TV_PACK_MAX_MB,
	TV_UPLOAD_GONE,
} from "./lib/tv/constants.ts";
import { shouldDeleteNewPack } from "./lib/tv/packBuild.ts";
import { readPackZip, writePackZip } from "./lib/tv/packZip.ts";
import type { ImportOutcome } from "./tvPackInternal.ts";

// Actions are not retried by Convex, so a failed build (a blob a concurrent
// prune just deleted, a storage hiccup) reschedules itself a few times.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 10_000;

type PackSource = NonNullable<
	FunctionReturnType<typeof internal.tvPackInternal.packSource>
>;

function logSkip(version: number, reason: string): void {
	// eslint-disable-next-line no-console -- the operator reads a skipped build in the Convex logs
	console.error(
		`tvPack: version ${String(version)} ${reason}, build skipped`
	);
}

/**
 * The files to zip, read one blob at a time (memory stays at the files read so
 * far plus one). Undefined, after a log line, when no build can succeed:
 * too many files or bytes, or a file whose blob is gone (a retry cannot bring
 * it back; the board sees it flagged).
 */
async function readSourceFiles(
	context: ActionCtx,
	source: PackSource
): Promise<{ path: string; bytes: Uint8Array }[] | undefined> {
	if (source.isOverLimit) {
		logSkip(source.version, "has too many files or bytes to zip");
		return undefined;
	}
	if (source.missing.length > 0) {
		logSkip(
			source.version,
			`references files gone from storage (${source.missing.join(", ")})`
		);
		return undefined;
	}
	const files: { path: string; bytes: Uint8Array }[] = [];
	let total = 0;
	for (const asset of source.assets) {
		const blob = await context.storage.get(asset.fileId);
		invariant(blob, `tvAssets blob missing for ${asset.path}`);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		total += bytes.byteLength;
		if (!isPackSizeOk([total])) {
			logSkip(source.version, "files are over the pack size limit");
			return undefined;
		}
		files.push({ path: asset.path, bytes });
	}
	return files;
}

/** Zips the current config and files once per version, so a TV never triggers a build. */
export const buildPack = internalAction({
	args: { version: v.number(), attempt: v.optional(v.number()) },
	handler: async (context, args): Promise<void> => {
		const attempt = args.attempt ?? 1;
		let packFileId: Id<"_storage"> | undefined;
		try {
			const source = await context.runQuery(
				internal.tvPackInternal.packSource,
				{}
			);
			if (source?.version !== args.version) return;
			const files = await readSourceFiles(context, source);
			if (files === undefined) return;
			// fflate allocates a fresh ArrayBuffer, so the narrower type is true.
			const zip = writePackZip(
				source.xml,
				files
			) as Uint8Array<ArrayBuffer>;
			packFileId = await context.storage.store(
				new Blob([zip], { type: "application/zip" })
			);
			await context.runMutation(internal.tvPackInternal.setPack, {
				version: args.version,
				packFileId,
			});
		} catch (error) {
			if (packFileId !== undefined) {
				const stored = packFileId;
				async function isLive(): Promise<boolean> {
					const live = await context.runQuery(
						internal.tvPackInternal.livePackFileId,
						{}
					);
					return live === stored;
				}
				if (await shouldDeleteNewPack(isLive))
					await context.storage.delete(stored).catch(() => {});
				else if (await isLive().catch(() => false)) return;
			}
			if (attempt >= MAX_ATTEMPTS) {
				// eslint-disable-next-line no-console -- the operator reads a given-up build in the Convex logs
				console.error(
					`tvPack: build of version ${String(args.version)} failed ${String(attempt)} times, giving up: ${String(error)}`
				);
				return;
			}
			await context.scheduler.runAfter(
				RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
				internal.tvPack.buildPack,
				{ version: args.version, attempt: attempt + 1 }
			);
		}
	},
});

/**
 * Board-only: replace the pack with an uploaded zip (untrusted: see
 * `readPackZip`). The upload is always deleted; on any refusal every file
 * stored for it is deleted too, so nothing is orphaned.
 */
export const importPack = action({
	args: { storageId: v.id("_storage") },
	handler: async (context, args): Promise<ImportOutcome> => {
		await context.runQuery(internal.tvPackInternal.requireBoard, {});
		// Before any download or delete: the caller picks the id, so it may
		// name a blob that is not theirs to read or drop. A refused blob is
		// left alone.
		const upload = await context.runQuery(
			internal.tvPackInternal.inspectUpload,
			{ storageId: args.storageId }
		);
		if (upload === null) return { ok: false, problems: [TV_UPLOAD_GONE] };
		if (!upload.isImportable)
			return { ok: false, problems: ["That upload is not a pack zip."] };
		try {
			// The size is known from metadata: an oversize blob is never downloaded.
			if (upload.size > TV_PACK_LIMITS.packMaxBytes)
				return {
					ok: false,
					problems: [
						`The pack is larger than ${String(TV_PACK_MAX_MB)} MB.`,
					],
				};
			const blob = await context.storage.get(args.storageId);
			return await importBlob(context, blob);
		} finally {
			// Atomic recheck: the blob may have become a holder's file since inspectUpload.
			await context
				.runMutation(internal.tvPackInternal.dropUpload, {
					storageId: args.storageId,
				})
				.catch(() => {});
		}
	},
});

async function importBlob(
	context: ActionCtx,
	blob: Blob | null
): Promise<ImportOutcome> {
	if (blob === null) return { ok: false, problems: [TV_UPLOAD_GONE] };
	const read = readPackZip(new Uint8Array(await blob.arrayBuffer()));
	if (read.isErr()) return { ok: false, problems: read.error };
	const assets: {
		path: string;
		size: number;
		contentType: string;
		fileId: Id<"_storage">;
	}[] = [];
	// One at a time on purpose: it keeps at most one extra copy in memory.
	// Any failure, thrown or returned, deletes what was stored so far.
	let isKept = false;
	let isSent = false;
	let isReplied = false;
	try {
		for (const file of read.value.files)
			assets.push({
				path: file.path,
				size: file.bytes.byteLength,
				contentType: file.contentType,
				fileId: await context.storage.store(
					new Blob([file.bytes as Uint8Array<ArrayBuffer>], {
						type: file.contentType,
					})
				),
			});
		isSent = true;
		const replaced = await context.runMutation(
			internal.tvPackInternal.replacePack,
			{ xml: serializeConfig(read.value.config), assets }
		);
		isReplied = true;
		isKept = replaced.ok;
		return replaced;
	} finally {
		// A thrown mutation is not a failed commit (the response may be what
		// was lost): if the rows exist the blobs are live. When even that check
		// fails, keep them: an orphan is harmless, a TV pointing at a deleted
		// blob is not.
		if (isSent && !isReplied)
			isKept = await context
				.runQuery(internal.tvPackInternal.holdsAnyBlob, {
					fileIds: assets.map((asset) => asset.fileId),
				})
				.catch(() => true);
		if (!isKept) await discard(context, assets);
	}
}

async function discard(
	context: ActionCtx,
	assets: { fileId: Id<"_storage"> }[]
): Promise<void> {
	for (const asset of assets)
		await context.storage.delete(asset.fileId).catch(() => {});
}
