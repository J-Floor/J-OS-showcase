import {
	Inflate,
	unzipSync,
	zipSync,
	type UnzipFileInfo,
	type Unzipped,
	type Zippable,
} from "fflate";
import { err, fromThrowable, ok, type Result } from "neverthrow";

import { invariant } from "../result.ts";

import { isEventSlide, missingFromPack } from "./configEdits.ts";
import { describeProblem, parseConfigXml, type TvConfig } from "./configXml.ts";
import { TV_PACK_LIMITS, TV_PACK_MAX_MB } from "./constants.ts";
import {
	extensionOf,
	isEventPackPath,
	isPackPath,
	packContentType,
	packFileMaxBytes,
	PACK_CONFIG_PATH,
} from "./packPaths.ts";

export type PackFile = { path: string; bytes: Uint8Array; contentType: string };
export type PackContents = { config: TvConfig; files: PackFile[] };

/** Archive noise and folder entries: skipped, never stored. */
const IGNORED = /^__MACOSX\/|(?:^|\/)\.DS_Store$|\/$/;
/** Already compressed: stored as-is in a built pack. */
const STORED = new Set(["png", "jpg", "jpeg", "webp", "gif", "woff", "woff2"]);

const NOT_A_ZIP = ["That file is not a zip archive."];

const unzip = fromThrowable(
	(zip: Uint8Array, isWanted: (file: UnzipFileInfo) => boolean): Unzipped =>
		unzipSync(zip, { filter: isWanted }),
	() => NOT_A_ZIP
);

/* eslint-disable @typescript-eslint/no-magic-numbers -- the zip and CRC-32 binary layouts: field offsets and masks from the format specs */
const END_OF_DIRECTORY = 0x06_05_4b_50;
const DIRECTORY_ENTRY = 0x02_01_4b_50;
const LOCAL_HEADER = 0x04_03_4b_50;
const ZIP64_LOCATOR = 0x07_06_4b_50;
const STORED_METHOD = 0;
const DEFLATED_METHOD = 8;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++)
		value = (value & 1) === 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let value = 0xff_ff_ff_ff;
	for (const byte of bytes)
		value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
	return (value ^ 0xff_ff_ff_ff) >>> 0;
}

type DirectoryRecord = { crc: number; offset: number };

/**
 * The CRC-32 and local-header offset each directory entry declares, in
 * directory order (the order fflate lists them). Undefined for what it cannot
 * follow, zip64 included; a read past the end throws, which the caller turns
 * into the same refusal.
 */
/** Exported for the parser's own fail-closed tests. */
export function readDirectoryRecords(
	zip: Uint8Array
): DirectoryRecord[] | undefined {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	let end = zip.byteLength - 22;
	while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
	if (
		end < 0 ||
		(end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR)
	)
		return undefined;
	const count = view.getUint16(end + 8, true);
	let at = view.getUint32(end + 16, true);
	const records: DirectoryRecord[] = [];
	for (let index = 0; index < count; index++) {
		if (view.getUint32(at, true) !== DIRECTORY_ENTRY) return undefined;
		records.push({
			crc: view.getUint32(at + 16, true),
			offset: view.getUint32(at + 42, true),
		});
		at +=
			46 +
			view.getUint16(at + 28, true) +
			view.getUint16(at + 30, true) +
			view.getUint16(at + 32, true);
	}
	return records;
}

/** Input fed to the inflater at a time: bounds one push's output to ~4 MB (deflate expands at most ~1032:1). */
const INFLATE_CHUNK = 4096;

/** Where an entry's data starts, from its local header; undefined if the header is not there. */
function dataStart(zip: Uint8Array, offset: number): number | undefined {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	return offset + 30 > zip.byteLength ||
		view.getUint32(offset, true) !== LOCAL_HEADER
		? undefined
		: offset +
				30 +
				view.getUint16(offset + 26, true) +
				view.getUint16(offset + 28, true);
}

/**
 * Inflates into a buffer of exactly `size` bytes, giving up the moment the
 * output would pass it: work is bounded by the declared size, not by what the
 * compressed stream could expand to. Undefined on an overrun, a bad stream or
 * a short result.
 */
function inflateExactly(
	data: Uint8Array,
	size: number
): Uint8Array | undefined {
	const out = new Uint8Array(size);
	let filled = 0;
	const inflater = new Inflate((chunk) => {
		if (filled + chunk.length <= size) out.set(chunk, filled);
		filled += chunk.length;
	});
	try {
		for (
			let at = 0;
			at < data.length && filled <= size;
			at += INFLATE_CHUNK
		) {
			const next = at + INFLATE_CHUNK;
			inflater.push(data.subarray(at, next), next >= data.length);
		}
	} catch {
		return undefined;
	}
	return filled === size ? out : undefined;
}

function entryBytes(
	zip: Uint8Array,
	entry: UnzipFileInfo,
	record: DirectoryRecord | undefined
): Uint8Array | undefined {
	if (record === undefined) return undefined;
	const start = dataStart(zip, record.offset);
	if (start === undefined || start + entry.size > zip.byteLength)
		return undefined;
	const data = zip.subarray(start, start + entry.size);
	const bytes =
		entry.compression === STORED_METHOD
			? data.slice()
			: inflateExactly(data, entry.originalSize);
	return bytes !== undefined && crc32(bytes) === record.crc
		? bytes
		: undefined;
}
/* eslint-enable @typescript-eslint/no-magic-numbers -- end of the binary-layout section */

const readRecords = fromThrowable(readDirectoryRecords, () => NOT_A_ZIP);

function directoryRecords(
	zip: Uint8Array
): Result<DirectoryRecord[], string[]> {
	return readRecords(zip).andThen((records) =>
		records === undefined ? err(NOT_A_ZIP) : ok(records)
	);
}

const NAME_SHOWN = 80;

/** An attacker-chosen name, cut short before it goes into a message. */
function shown(name: string): string {
	return name.length > NAME_SHOWN ? `${name.slice(0, NAME_SHOWN)}...` : name;
}

type Listed = { entry: UnzipFileInfo; index: number };

function isKept(entry: UnzipFileInfo): boolean {
	return !IGNORED.test(entry.name);
}

/**
 * fflate sizes the buffer of a stored entry by its COMPRESSED size and
 * ignores `originalSize`, and reads a deflated one's input as a view. So
 * both sizes are capped, and both count toward the total.
 */
function entryProblem(
	entry: UnzipFileInfo,
	seen: Set<string>
): string | undefined {
	if (seen.has(entry.name)) return `${shown(entry.name)} appears twice.`;
	if (entry.name !== PACK_CONFIG_PATH && !isPackPath(entry.name))
		return `${shown(entry.name)} is not an allowed path or file type.`;
	if (
		entry.compression !== STORED_METHOD &&
		entry.compression !== DEFLATED_METHOD
	)
		return `${shown(entry.name)} uses an unsupported compression.`;
	if (Math.max(entry.originalSize, entry.size) > packFileMaxBytes(entry.name))
		return `${shown(entry.name)} is too large.`;
	return entry.compression === STORED_METHOD &&
		entry.size !== entry.originalSize
		? `${shown(entry.name)} has inconsistent sizes.`
		: undefined;
}

/** A zip made by dragging a folder: everything sits inside one wrapper folder. */
function isWrapped(entries: UnzipFileInfo[]): boolean {
	return entries.some((entry) => entry.name.endsWith(`/${PACK_CONFIG_PATH}`));
}

/**
 * Checks the listing alone: nothing has been inflated yet. `entryCount`
 * includes the skipped entries (macOS noise, folders): they cost listing
 * work, so they count toward the file cap.
 */
function listingProblems(
	entries: UnzipFileInfo[],
	entryCount: number
): string[] {
	if (entryCount > TV_PACK_LIMITS.maxFiles)
		return [
			`A pack can hold at most ${String(TV_PACK_LIMITS.maxFiles)} files.`,
		];
	if (
		!entries.some((entry) => entry.name === PACK_CONFIG_PATH) &&
		isWrapped(entries)
	)
		return [
			"config.xml must be at the top of the zip, not inside a folder.",
		];
	const problems: string[] = [];
	const seen = new Set<string>();
	let total = 0;
	for (const entry of entries) {
		const problem = entryProblem(entry, seen);
		if (problem !== undefined) problems.push(problem);
		seen.add(entry.name);
		total += Math.max(entry.originalSize, entry.size);
	}
	if (total > TV_PACK_LIMITS.packMaxBytes)
		problems.push(
			`The unpacked files are larger than ${String(TV_PACK_MAX_MB)} MB.`
		);
	if (!seen.has(PACK_CONFIG_PATH))
		problems.push("The pack needs a config.xml at its top level.");
	return problems;
}

/**
 * Inflates and verifies the kept entries, in directory order, stopping at the
 * first damaged one: total work stays bounded by the declared sizes.
 */
function extract(
	zip: Uint8Array,
	listed: Listed[],
	records: DirectoryRecord[]
): Result<Map<string, Uint8Array>, string[]> {
	const extracted = new Map<string, Uint8Array>();
	for (const { entry, index } of listed) {
		const bytes = entryBytes(zip, entry, records[index]);
		if (bytes === undefined)
			return err([`${shown(entry.name)} is damaged.`]);
		extracted.set(entry.name, bytes);
	}
	return ok(extracted);
}

function contentsOf(
	extracted: Map<string, Uint8Array>
): Result<PackContents, string[]> {
	const xml = new TextDecoder().decode(extracted.get(PACK_CONFIG_PATH));
	const files = [...extracted]
		.filter(([path]) => path !== PACK_CONFIG_PATH)
		.map(([path, bytes]) => ({
			path,
			bytes,
			contentType: packContentType(path),
		}));
	return parseConfigXml(xml)
		.mapErr((found) =>
			found.map((problem) => `config.xml: ${describeProblem(problem)}`)
		)
		.andThen((config) => checkSlides(config, files));
}

/**
 * A downloaded pack carries the event slides (`source="event"` entries,
 * `slides/event-*` and `assets/events/**`). They are dropped here, before the
 * rest is checked: the events on the TV now are kept by the import, and an
 * upload can never write an event's path. A manual slide that points at a
 * dropped path then fails "is not in the pack".
 */
function checkSlides(
	config: TvConfig,
	files: PackFile[]
): Result<PackContents, string[]> {
	const manual: TvConfig = {
		...config,
		slides: config.slides.filter((slide) => !isEventSlide(slide)),
	};
	const kept = files.filter((file) => !isEventPackPath(file.path));
	const paths = new Set(kept.map((file) => file.path));
	const problems = missingFromPack(manual, paths);
	return problems.length > 0
		? err(problems)
		: ok({ config: manual, files: kept });
}

/**
 * Reads an uploaded pack. Untrusted: the listing (paths, count, declared
 * sizes, compression) is checked before anything is inflated, then each
 * file is inflated by `inflateExactly`, which stops as soon as the output
 * passes the declared size, and checked against its CRC-32. Memory and CPU
 * are bounded by the caps on the declared sizes, whatever the compressed
 * stream holds.
 * It does not check that an image or HTML file's CONTENT is valid.
 */
export function readPackZip(zip: Uint8Array): Result<PackContents, string[]> {
	if (zip.byteLength > TV_PACK_LIMITS.packMaxBytes)
		return err([`The pack is larger than ${String(TV_PACK_MAX_MB)} MB.`]);
	const listed: Listed[] = [];
	let entryCount = 0;
	return unzip(zip, (entry) => {
		if (isKept(entry)) listed.push({ entry, index: entryCount });
		entryCount++;
		return false;
	})
		.andThen(() => {
			const problems = listingProblems(
				listed.map(({ entry }) => entry),
				entryCount
			);
			return problems.length > 0 ? err(problems) : ok(undefined);
		})
		.andThen(() => directoryRecords(zip))
		.andThen((records) =>
			records.length === entryCount ? ok(records) : err(NOT_A_ZIP)
		)
		.andThen((records) => extract(zip, listed, records))
		.andThen(contentsOf);
}

/** A fixed timestamp, local time (fflate reads the local fields): the same pack always zips to the same bytes. */
const PACK_YEAR = 2000;
const PACK_MTIME = new Date(PACK_YEAR, 0, 1);

/**
 * The pack a TV downloads: config.xml plus every file; images and fonts
 * stored, the rest deflated. Deterministic. Throws on a path
 * `readPackZip` would refuse (or a repeated one): callers pass stored,
 * already validated files.
 */
export function writePackZip(
	xml: string,
	files: { path: string; bytes: Uint8Array }[]
): Uint8Array {
	const entries: Zippable = {
		[PACK_CONFIG_PATH]: new TextEncoder().encode(xml),
	};
	for (const file of files) {
		invariant(
			isPackPath(file.path) && !(file.path in entries),
			`${file.path} cannot go in a pack.`
		);
		entries[file.path] = STORED.has(extensionOf(file.path))
			? [file.bytes, { level: 0 }]
			: file.bytes;
	}
	return zipSync(entries, { level: 6, mtime: PACK_MTIME });
}
