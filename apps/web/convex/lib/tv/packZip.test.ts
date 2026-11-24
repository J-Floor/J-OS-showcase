import {
	deflateSync,
	strToU8,
	unzipSync,
	zipSync,
	type Zippable,
} from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TV_LIMITS, TV_PACK_LIMITS } from "./constants.ts";
import { readDirectoryRecords, readPackZip, writePackZip } from "./packZip.ts";

const CONFIG = `<tv version="1">
<slide id="a" type="image" src="slides/a.png"/>
<slide id="b" type="html" src="slides/b.html"/>
</tv>`;
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const HTML = '<p style="font-family:x">Hi</p><img src="assets/logo.png">';

function zip(entries: Zippable): Uint8Array {
	return zipSync(entries);
}

function validEntries(): Zippable {
	return {
		"config.xml": strToU8(CONFIG),
		"slides/a.png": PNG,
		"slides/b.html": strToU8(HTML),
		"assets/logo.png": PNG,
	};
}

const DIRECTORY_FIELDS = {
	crc: 16,
	size: 20,
	originalSize: 24,
	compression: 10,
} as const;

/** Rewrites one field of a named entry's central directory record. */
function patchEntry(
	bytes: Uint8Array,
	name: string,
	field: keyof typeof DIRECTORY_FIELDS,
	value: number
): void {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let offset = 0; offset < bytes.length - 46; offset++) {
		if (view.getUint32(offset, true) !== 0x02014b50) continue;
		const nameLength = view.getUint16(offset + 28, true);
		const found = new TextDecoder().decode(
			bytes.subarray(offset + 46, offset + 46 + nameLength)
		);
		if (found !== name) continue;
		if (field === "compression")
			view.setUint16(offset + DIRECTORY_FIELDS[field], value, true);
		else view.setUint32(offset + DIRECTORY_FIELDS[field], value, true);
	}
}

type RawEntry = {
	name: string;
	data: Uint8Array;
	/** Declared sizes, default to the data length. */
	size?: number;
	originalSize?: number;
	/** Compression method, default 0 (stored). */
	method?: number;
	/** The CRC-32 the directory declares, default 0. */
	crc?: number;
	/** Write no data of its own: point at this entry's local header. */
	sharesWith?: number;
};

/** A stored-entry zip built by hand, so a central directory can say anything. */
function rawZip(entries: RawEntry[]): Uint8Array {
	const chunks: Uint8Array[] = [];
	const offsets: number[] = [];
	let length = 0;
	function push(chunk: Uint8Array): void {
		chunks.push(chunk);
		length += chunk.length;
	}
	function header(size: number, write: (view: DataView) => void): void {
		const chunk = new Uint8Array(size);
		write(new DataView(chunk.buffer));
		push(chunk);
	}
	for (const [index, entry] of entries.entries()) {
		if (entry.sharesWith !== undefined) {
			offsets[index] = offsets[entry.sharesWith] ?? 0;
			continue;
		}
		offsets[index] = length;
		const name = strToU8(entry.name);
		header(30, (view) => {
			view.setUint32(0, 0x04034b50, true);
			view.setUint16(4, 20, true);
			view.setUint32(18, entry.data.length, true);
			view.setUint32(22, entry.data.length, true);
			view.setUint16(26, name.length, true);
		});
		push(name);
		push(entry.data);
	}
	const directoryStart = length;
	for (const [index, entry] of entries.entries()) {
		const name = strToU8(entry.name);
		header(46, (view) => {
			view.setUint32(0, 0x02014b50, true);
			view.setUint16(4, 20, true);
			view.setUint16(6, 20, true);
			view.setUint16(10, entry.method ?? 0, true);
			view.setUint32(16, entry.crc ?? 0, true);
			view.setUint32(20, entry.size ?? entry.data.length, true);
			view.setUint32(24, entry.originalSize ?? entry.data.length, true);
			view.setUint16(28, name.length, true);
			view.setUint32(42, offsets[index] ?? 0, true);
		});
		push(name);
	}
	header(22, (view) => {
		view.setUint32(0, 0x06054b50, true);
		view.setUint16(8, entries.length, true);
		view.setUint16(10, entries.length, true);
		view.setUint32(12, length - directoryStart, true);
		view.setUint32(16, directoryStart, true);
	});
	const out = new Uint8Array(length);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

function problems(bytes: Uint8Array): string[] {
	const result = readPackZip(bytes);
	expect(result.isErr()).toBe(true);
	return result.isErr() ? result.error : [];
}

describe("readPackZip", () => {
	it("reads config.xml and the files with their content types", () => {
		const result = readPackZip(zip(validEntries()));
		expect(result.isOk()).toBe(true);
		if (!result.isOk()) return;
		expect(result.value.config.slides.map((slide) => slide.id)).toEqual([
			"a",
			"b",
		]);
		expect(
			result.value.files.map(({ path, contentType }) => [
				path,
				contentType,
			])
		).toEqual([
			["slides/a.png", "image/png"],
			["slides/b.html", "text/html"],
			["assets/logo.png", "image/png"],
		]);
		expect(result.value.files[0]?.bytes).toEqual(PNG);
	});

	it("skips macOS noise and folder entries", () => {
		const result = readPackZip(
			zip({
				...validEntries(),
				"__MACOSX/slides/._a.png": PNG,
				"assets/.DS_Store": PNG,
				"assets/empty/": new Uint8Array(),
			})
		);
		expect(result.isOk()).toBe(true);
	});

	it("refuses a file that is not a zip", () => {
		expect(problems(strToU8("hello"))[0]).toContain("not a zip");
	});

	it("needs config.xml at the top", () => {
		const rest = validEntries();
		delete rest["config.xml"];
		expect(problems(zip(rest)).join()).toContain("config.xml");
	});

	it.each([
		"../evil.png",
		"slides/../../evil.png",
		"/abs.png",
		"assets/x.svg",
		"assets/x.js",
		"assets/x.html",
		"other/x.png",
	])("refuses the path %s before inflating anything", (path) => {
		expect(
			problems(zip({ ...validEntries(), [path]: PNG })).join()
		).toContain(path);
	});

	it("refuses more files than the cap", () => {
		const entries = validEntries();
		for (let index = 0; index < TV_PACK_LIMITS.maxFiles; index++)
			entries[`assets/f${String(index)}.png`] = PNG;
		expect(problems(zip(entries)).join()).toContain(
			String(TV_PACK_LIMITS.maxFiles)
		);
	});

	it("refuses a zip bomb by its declared size, without inflating it", () => {
		const bomb = new Uint8Array(TV_LIMITS.imageMaxBytes + 1);
		expect(
			problems(zip({ ...validEntries(), "assets/bomb.png": bomb })).join()
		).toContain("assets/bomb.png is too large");
	});

	it("refuses an HTML slide over the HTML cap", () => {
		const big = strToU8(`<p>${"x".repeat(TV_LIMITS.htmlMax)}</p>`);
		expect(
			problems(zip({ ...validEntries(), "slides/b.html": big })).join()
		).toContain("slides/b.html is too large");
	});

	it("refuses an upload larger than the pack cap before reading it", () => {
		expect(
			problems(new Uint8Array(TV_PACK_LIMITS.packMaxBytes + 1))[0]
		).toContain("larger than 40 MB");
	});

	it("refuses a deflated entry whose declared size is too small (overrun)", () => {
		const bytes = zip({
			...validEntries(),
			"assets/big.png": new Uint8Array(4096),
		});
		patchEntry(bytes, "assets/big.png", "originalSize", 16);
		expect(problems(bytes)).toEqual(["assets/big.png is damaged."]);
	});

	it("refuses a deflated entry whose declared size is too large", () => {
		const bytes = zip({
			...validEntries(),
			"assets/big.png": new Uint8Array(4096),
		});
		patchEntry(bytes, "assets/big.png", "originalSize", 5000);
		expect(problems(bytes)).toEqual(["assets/big.png is damaged."]);
	});

	it("refuses a file whose CRC does not match", () => {
		const bytes = zip(validEntries());
		patchEntry(bytes, "slides/a.png", "crc", 12_345);
		expect(problems(bytes)).toEqual(["slides/a.png is damaged."]);
	});

	it("refuses a stored entry whose compressed size lies", () => {
		const bytes = rawZip([
			{ name: "config.xml", data: strToU8(CONFIG) },
			{ name: "assets/x.png", data: PNG, size: PNG.length + 2 },
		]);
		expect(problems(bytes)).toEqual([
			"assets/x.png has inconsistent sizes.",
		]);
	});

	it("refuses a stored entry whose compressed size is over the file cap", () => {
		const bytes = rawZip([
			{ name: "config.xml", data: strToU8(CONFIG) },
			{
				name: "assets/x.png",
				data: PNG,
				size: TV_LIMITS.imageMaxBytes + 1,
				originalSize: 0,
			},
		]);
		expect(problems(bytes)).toEqual(["assets/x.png is too large."]);
	});

	it("refuses many entries that share one stored body and claim a big size each", () => {
		// 6 x 7 MB declared (originalSize 0) over one 7 MB body: fflate would
		// copy a 7 MB slice per entry, 200 entries of 40 MB would be 8 GB.
		const body = new Uint8Array(7_000_000);
		const shared = Array.from({ length: 6 }, (_, index) => ({
			name: `assets/s${String(index)}.png`,
			data: new Uint8Array(),
			size: body.length,
			originalSize: 0,
			sharesWith: 1,
		}));
		const bytes = rawZip([
			{ name: "config.xml", data: strToU8(CONFIG) },
			{ name: "assets/s.png", data: body },
			...shared,
		]);
		expect(bytes.length).toBeLessThan(TV_PACK_LIMITS.packMaxBytes);
		expect(problems(bytes).join()).toContain("larger than 40 MB");
	});

	it("refuses a compression method other than stored or deflate", () => {
		const bytes = zip(validEntries());
		patchEntry(bytes, "slides/a.png", "compression", 9);
		expect(problems(bytes)).toEqual([
			"slides/a.png uses an unsupported compression.",
		]);
	});

	it("refuses files that together unpack past the pack cap", () => {
		const entries = validEntries();
		for (let index = 0; index < 6; index++)
			entries[`assets/z${String(index)}.png`] = new Uint8Array(
				TV_LIMITS.imageMaxBytes
			);
		expect(problems(zip(entries)).join()).toContain("larger than 40 MB");
	});

	it("refuses a name that appears twice", () => {
		const bytes = rawZip([
			{ name: "config.xml", data: strToU8(CONFIG) },
			{ name: "slides/a.png", data: PNG },
			{ name: "slides/a.png", data: PNG },
		]);
		expect(problems(bytes)).toEqual(["slides/a.png appears twice."]);
	});

	it("counts skipped entries toward the file cap", () => {
		const entries = validEntries();
		for (let index = 0; index < TV_PACK_LIMITS.maxFiles; index++)
			entries[`__MACOSX/f${String(index)}`] = PNG;
		expect(problems(zip(entries)).join()).toContain(
			String(TV_PACK_LIMITS.maxFiles)
		);
	});

	it("says config.xml must not sit inside a wrapper folder", () => {
		const wrapped: Zippable = {};
		for (const [path, bytes] of Object.entries(validEntries()))
			wrapped[`pack/${path}`] = bytes;
		expect(problems(zip(wrapped))).toEqual([
			"config.xml must be at the top of the zip, not inside a folder.",
		]);
	});

	it("reports config.xml problems with the file name and line", () => {
		const entries = {
			...validEntries(),
			"config.xml": strToU8(
				'<tv version="1">\n<slide id="a" type="video" src="slides/a.png"/>\n</tv>'
			),
		};
		expect(problems(zip(entries))[0]).toBe(
			'config.xml: Line 2: Slide "a": type must be image or html.'
		);
	});

	it("refuses a slide whose file is not in the zip", () => {
		const rest = validEntries();
		delete rest["slides/a.png"];
		expect(problems(zip(rest)).join()).toContain("slides/a.png");
	});

	it("refuses event slides in an imported config", () => {
		const entries = {
			...validEntries(),
			"config.xml": strToU8(
				'<tv version="1"><slide id="e" type="image" src="slides/a.png" source="event" event="abc"/></tv>'
			),
		};
		expect(problems(zip(entries)).join()).toContain("event slides");
	});
});

const NOT_A_ZIP = ["That file is not a zip archive."];

/** The valid zip with its 22-byte end record handed to `edit`. */
function withEndRecord(edit: (view: DataView, at: number) => void): Uint8Array {
	const bytes = zip(validEntries());
	edit(new DataView(bytes.buffer), bytes.length - 22);
	return bytes;
}

describe("readPackZip on a damaged directory", () => {
	it("refuses a zip cut short, with no end record left", () => {
		const bytes = zip(validEntries());
		expect(problems(bytes.subarray(0, bytes.length - 1))).toEqual(
			NOT_A_ZIP
		);
		expect(problems(bytes.subarray(0, bytes.length >> 1))).toEqual(
			NOT_A_ZIP
		);
	});

	it("refuses garbage and an empty file", () => {
		expect(problems(new Uint8Array(5000))).toEqual(NOT_A_ZIP);
		expect(problems(new Uint8Array())).toEqual(NOT_A_ZIP);
	});

	it("refuses a zip64 locator", () => {
		const bytes = zip(validEntries());
		const end = bytes.length - 22;
		const out = new Uint8Array(bytes.length + 20);
		out.set(bytes.subarray(0, end));
		out.set([0x50, 0x4b, 6, 7], end);
		out.set(bytes.subarray(end), end + 20);
		expect(problems(out)).toEqual(NOT_A_ZIP);
		expect(readDirectoryRecords(out)).toBeUndefined();
	});

	it("refuses a directory offset outside the file", () => {
		const bytes = withEndRecord((view, at) => {
			view.setUint32(at + 16, 0xff_ff_ff_f0, true);
		});
		expect(problems(bytes).length).toBeGreaterThan(0);
		expect(() => readDirectoryRecords(bytes)).toThrow();
	});

	it("follows no entry whose signature is wrong", () => {
		const bytes = zip(validEntries());
		const view = new DataView(bytes.buffer);
		const end = bytes.length - 22;
		const records = readDirectoryRecords(bytes);
		expect(records).toHaveLength(4);
		// Break the second directory record's signature.
		let at = view.getUint32(end + 16, true);
		at += 46 + view.getUint16(at + 28, true);
		view.setUint32(at, 0, true);
		expect(readDirectoryRecords(bytes)).toBeUndefined();
		expect(problems(bytes)).toEqual(NOT_A_ZIP);
	});

	it("refuses a count that claims entries that are not there", () => {
		const bytes = withEndRecord((view, at) => {
			view.setUint16(at + 8, 5000, true);
		});
		expect(problems(bytes).length).toBeGreaterThan(0);
	});

	it("stops at the file-cap message when the end record claims 65,535 entries", () => {
		const record = new Uint8Array(22);
		const view = new DataView(record.buffer);
		view.setUint32(0, 0x06054b50, true);
		view.setUint16(8, 65_535, true);
		view.setUint16(10, 65_535, true);
		expect(problems(record)).toEqual([
			`A pack can hold at most ${String(TV_PACK_LIMITS.maxFiles)} files.`,
		]);
	});

	it("cuts a long entry name in its error message", () => {
		const name = `assets/${"a".repeat(500)}.svg`;
		const [message] = problems(zip({ ...validEntries(), [name]: PNG }));
		expect(message).toBe(
			`${name.slice(0, 80)}... is not an allowed path or file type.`
		);
	});

	it("refuses an overrunning deflate stream without inflating it", () => {
		const stream = deflateSync(new Uint8Array(100_000_000), { level: 9 });
		// The bomb entry is first, so it is the one that is read.
		const bytes = rawZip([
			{
				name: "assets/bomb.png",
				data: stream,
				method: 8,
				originalSize: 16,
			},
			{ name: "config.xml", data: strToU8(CONFIG) },
		]);
		const started = performance.now();
		const result = readPackZip(bytes);
		const elapsed = performance.now() - started;
		expect(result.isErr() && result.error).toEqual([
			"assets/bomb.png is damaged.",
		]);
		expect(elapsed).toBeLessThan(250);
	});
});

function crcOf(data: Uint8Array): number {
	const records = readDirectoryRecords(zip({ x: data }));
	return records?.[0]?.crc ?? 0;
}

describe("readPackZip on a deflate stream", () => {
	it("refuses a stream that never ends, even when size and CRC are right", () => {
		// One stored block with BFINAL clear: it holds the right bytes but is cut off.
		const open = new Uint8Array([
			0,
			PNG.length,
			0,
			~PNG.length & 0xff,
			0xff,
			...PNG,
		]);
		const config = strToU8(CONFIG);
		const bytes = rawZip([
			{
				name: "assets/x.png",
				data: open,
				method: 8,
				originalSize: PNG.length,
				crc: crcOf(PNG),
			},
			{ name: "config.xml", data: config, crc: crcOf(config) },
		]);
		expect(problems(bytes)).toEqual(["assets/x.png is damaged."]);
	});

	it("copies a stored entry, so the file does not alias the upload's buffer", () => {
		const config = strToU8('<tv version="1"/>');
		const bytes = rawZip([
			{ name: "assets/x.png", data: PNG, crc: crcOf(PNG) },
			{ name: "config.xml", data: config, crc: crcOf(config) },
		]);
		const result = readPackZip(bytes);
		const file = result.isOk()
			? result.value.files.find((entry) => entry.path === "assets/x.png")
			: undefined;
		expect(file?.bytes).toEqual(PNG);
		bytes.fill(0);
		expect(file?.bytes).toEqual(PNG);
	});
});

describe("writePackZip", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("writes config.xml and every file at its path", () => {
		const bytes = writePackZip(CONFIG, [
			{ path: "slides/a.png", bytes: PNG },
			{ path: "slides/b.html", bytes: strToU8(HTML) },
		]);
		const files = unzipSync(bytes);
		expect(
			Object.keys(files).toSorted((left, right) =>
				left.localeCompare(right)
			)
		).toEqual(["config.xml", "slides/a.png", "slides/b.html"]);
		expect(new TextDecoder().decode(files["config.xml"])).toBe(CONFIG);
	});

	it("round-trips through readPackZip", () => {
		const bytes = writePackZip(CONFIG, [
			{ path: "slides/a.png", bytes: PNG },
			{ path: "slides/b.html", bytes: strToU8(HTML) },
			{ path: "assets/logo.png", bytes: PNG },
		]);
		expect(readPackZip(bytes).isOk()).toBe(true);
	});

	it("is deterministic, whatever the clock says", () => {
		const files = [{ path: "slides/a.png", bytes: PNG }];
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 1, 3));
		const first = writePackZip(CONFIG, files);
		vi.setSystemTime(new Date(2031, 6, 9));
		const second = writePackZip(CONFIG, files);
		expect(second).toEqual(first);
	});

	it.each(["../evil.png", "assets/x.svg", "other/x.png", "config.xml"])(
		"refuses the path %s that readPackZip would refuse",
		(path) => {
			expect(() => writePackZip(CONFIG, [{ path, bytes: PNG }])).toThrow(
				path
			);
		}
	);

	it("refuses a path given twice", () => {
		expect(() =>
			writePackZip(CONFIG, [
				{ path: "slides/a.png", bytes: PNG },
				{ path: "slides/a.png", bytes: PNG },
			])
		).toThrow("slides/a.png");
	});
});
