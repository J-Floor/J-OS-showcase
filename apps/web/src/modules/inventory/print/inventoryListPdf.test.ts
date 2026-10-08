// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import {
	formatInventoryListDate,
	generateInventoryListPdf,
	inventoryListPdfFilename,
	type InventoryListRow,
	type InventoryPdfAssets,
} from "./inventoryListPdf.ts";

const NOW = new Date("2026-09-12T12:00:00");
const STATIC_FONTS = resolve(
	import.meta.dirname,
	"../../../../agreements/static-fonts"
);

const ASSETS: InventoryPdfAssets = {
	letterhead: readFileSync(resolve(import.meta.dirname, "letterhead.pdf")),
	manropeRegular: readFileSync(resolve(STATIC_FONTS, "Manrope-Regular.ttf")),
	manropeBold: readFileSync(resolve(STATIC_FONTS, "Manrope-Bold.ttf")),
	azeretMonoRegular: readFileSync(
		resolve(STATIC_FONTS, "AzeretMono-Regular.ttf")
	),
};

function row(
	partial: Partial<InventoryListRow> & { assetTag: string }
): InventoryListRow {
	return {
		typeName: "Chair",
		categoryName: "Furniture",
		...partial,
	};
}

function generate(items: InventoryListRow[]): Promise<Uint8Array> {
	return generateInventoryListPdf(items, { now: NOW, assets: ASSETS });
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
	const { text } = await extractText(new Uint8Array(bytes), {
		mergePages: false,
	});
	return text;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
	return (await pageTexts(bytes)).join("\n");
}

function longList(): InventoryListRow[] {
	return Array.from({ length: 80 }, (_, i) =>
		row({
			assetTag: `A${String(i + 1).padStart(5, "0")}`,
			description: `Item ${String(i + 1)}`,
		})
	);
}

describe("inventoryListPdfFilename", () => {
	it("uses the local calendar day", () => {
		expect(inventoryListPdfFilename(NOW)).toBe(
			"inventory-list-2026-09-12.pdf"
		);
	});
});

describe("generateInventoryListPdf", () => {
	it("is a valid PDF titled Inventory List with the current date", async () => {
		const bytes = await generate([
			row({ assetTag: "A00001", description: "Meeting room" }),
		]);
		expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
		const text = await pdfText(bytes);
		expect(text).toContain("Inventory List");
		expect(text).toContain(formatInventoryListDate(NOW));
	});

	it("includes only the selected items' table fields", async () => {
		const bytes = await generate([
			row({
				assetTag: "A00001",
				typeName: "Chair",
				categoryName: "Furniture",
				description: "Meeting room",
			}),
			row({
				assetTag: "A00002",
				typeName: "Lamp",
				categoryName: "Lighting",
				description: "Hallway",
			}),
		]);
		const text = await pdfText(bytes);
		expect(text).toContain("Asset tag");
		expect(text).toContain("Type");
		expect(text).toContain("Category");
		expect(text).toContain("Description");
		expect(text).toContain("A00001");
		expect(text).toContain("Chair");
		expect(text).toContain("Furniture");
		expect(text).toContain("Meeting room");
		expect(text).toContain("A00002");
		expect(text).toContain("Lamp");
		expect(text).toContain("Lighting");
		expect(text).toContain("Hallway");
		expect(text).not.toContain("A00099");
	});

	it("renders a blank description as empty rather than undefined", async () => {
		const bytes = await generate([row({ assetTag: "A00003" })]);
		const text = await pdfText(bytes);
		expect(text).toContain("A00003");
		expect(text).not.toContain("undefined");
	});

	it("continues onto a second page for a long list and repeats the column header", async () => {
		const bytes = await generate(longList());
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBeGreaterThan(1);
		const text = await pdfText(bytes);
		expect(text.match(/Asset tag/g)?.length).toBeGreaterThan(1);
		expect(text).toContain("A00001");
		expect(text).toContain("A00080");
	});

	it("carries the letterhead and a page number on every page", async () => {
		const pages = await pageTexts(await generate(longList()));
		expect(pages.length).toBeGreaterThan(1);
		pages.forEach((text, i) => {
			expect(text).toContain("Inventory List");
			expect(text).toContain(
				"J floor. Build in Zurich. Capture the world."
			);
			expect(text).toContain(
				`Page ${String(i + 1)} of ${String(pages.length)}`
			);
		});
	});

	it("embeds the brand fonts and no standard font", async () => {
		const bytes = await generate([row({ assetTag: "A00001" })]);
		const raw = Buffer.from(bytes).toString("latin1");
		expect(raw).toMatch(/\/BaseFont \/Manrope-Regular\b/);
		expect(raw).toMatch(/\/BaseFont \/Manrope-Bold\b/);
		expect(raw).toMatch(/\/BaseFont \/AzeretMonoRoman-Regular\b/);
		expect(raw).not.toContain("Helvetica");
	});
});

const BASELINE_TOLERANCE = 0.5;
const TRANSFORM_Y = 5;

/** Baseline y of the first text item on page 1 that is exactly `word`. */
async function baselineOf(bytes: Uint8Array, word: string): Promise<number> {
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	const page = await pdf.getPage(1);
	const { items } = await page.getTextContent();
	const hit = items.find((item) => "str" in item && item.str === word);
	if (!hit || !("transform" in hit)) {
		throw new Error(`No text item "${word}" on page 1`);
	}
	const transform = hit.transform as number[];
	return transform[TRANSFORM_Y];
}

describe("letterhead alignment", () => {
	it("sets the date on the title's baseline and the page number on the tagline's", async () => {
		const bytes = await generate([row({ assetTag: "A00001" })]);
		const title = await baselineOf(bytes, "Inventory");
		const date = await baselineOf(
			bytes,
			formatInventoryListDate(NOW).split(/\s/)[0]
		);
		const tagline = await baselineOf(bytes, "world.");
		const pageNumber = await baselineOf(bytes, "Page");
		expect(Math.abs(date - title)).toBeLessThanOrEqual(BASELINE_TOLERANCE);
		expect(Math.abs(pageNumber - tagline)).toBeLessThanOrEqual(
			BASELINE_TOLERANCE
		);
	});
});

describe("generateInventoryListPdf with no items", () => {
	it("yields one page with the column headers and its page number", async () => {
		const pages = await pageTexts(await generate([]));
		expect(pages).toHaveLength(1);
		for (const header of ["Asset tag", "Type", "Category", "Description"]) {
			expect(pages[0]).toContain(header);
		}
		expect(pages[0]).toContain("Page 1 of 1");
	});
});
