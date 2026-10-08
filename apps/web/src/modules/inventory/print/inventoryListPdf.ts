import fontkit from "@pdf-lib/fontkit";
import {
	PageSizes,
	PDFDocument,
	rgb,
	type PDFEmbeddedPage,
	type PDFFont,
	type PDFPage,
} from "pdf-lib";

/** The subset of an inventory item the printed list needs. */
export type InventoryListRow = {
	assetTag: string;
	typeName: string;
	categoryName: string;
	description?: string;
};

/** The committed Typst letterhead (letterhead.pdf) and the static brand fonts
 * (agreements/static-fonts). Passed in so tests read them from disk and the
 * app fetches them only when someone prints. */
export type InventoryPdfAssets = {
	letterhead: Uint8Array;
	manropeRegular: Uint8Array;
	manropeBold: Uint8Array;
	azeretMonoRegular: Uint8Array;
};

type Fonts = { body: PDFFont; bold: PDFFont; mono: PDFFont };

// PDF points, origin bottom-left, measured on the compiled letterhead.pdf.
// They follow agreements/lib.typ's `letterhead()` page setup (A4, margins
// top 34mm, bottom 22mm, x 24mm); re-measure if that changes.
const CONTENT_LEFT = 68.03;
const CONTENT_RIGHT = 527.25;
const CONTENT_TOP = 745.51;
const CONTENT_BOTTOM = 62.36;
const HEADER_BASELINE = 779.53;
const FOOTER_BASELINE = 26.37;

const INK = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255);
const MUTED = rgb(0x66 / 255, 0x66 / 255, 0x66 / 255);
const META_SIZE = 9;
const FOOTER_SIZE = 8;
const CELL_SIZE = 9;
const LINE_HEIGHT = 12;
const ROW_PAD = 4;
const COL_GAP = 8;

const COLUMNS = [
	{ header: "Asset tag", width: 80 },
	{ header: "Type", width: 100 },
	{ header: "Category", width: 100 },
];
const DESCRIPTION_WIDTH =
	CONTENT_RIGHT -
	CONTENT_LEFT -
	COLUMNS.reduce((sum, col) => sum + col.width, 0) -
	COL_GAP * COLUMNS.length;
const COLUMN_WIDTHS = [...COLUMNS.map((col) => col.width), DESCRIPTION_WIDTH];

export function formatInventoryListDate(now: Date): string {
	return now.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function inventoryListPdfFilename(now: Date): string {
	const year = String(now.getFullYear());
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `inventory-list-${year}-${month}-${day}.pdf`;
}

export async function generateInventoryListPdf(
	items: InventoryListRow[],
	opts: { now?: Date; assets: InventoryPdfAssets }
): Promise<Uint8Array> {
	const now = opts.now ?? new Date();
	const doc = await PDFDocument.create();
	doc.setTitle("Inventory List");
	doc.registerFontkit(fontkit);
	const fonts: Fonts = {
		body: await doc.embedFont(opts.assets.manropeRegular, { subset: true }),
		bold: await doc.embedFont(opts.assets.manropeBold, { subset: true }),
		mono: await doc.embedFont(opts.assets.azeretMonoRegular, {
			subset: true,
		}),
	};
	const [letterhead] = await doc.embedPdf(opts.assets.letterhead);
	const dateLabel = formatInventoryListDate(now);

	function newPage(): PDFPage {
		const page = doc.addPage(PageSizes.A4);
		drawLetterhead(page, letterhead, fonts.mono, dateLabel);
		return page;
	}

	let page = newPage();
	let cursor = drawColumnHeaders(page, fonts.bold, CONTENT_TOP);

	for (const item of items) {
		const cells = cellLines(fonts.body, item);
		const rowHeight =
			ROW_PAD * 2 +
			Math.max(...cells.map((c) => c.length), 1) * LINE_HEIGHT;
		if (cursor - rowHeight < CONTENT_BOTTOM) {
			page = newPage();
			cursor = drawColumnHeaders(page, fonts.bold, CONTENT_TOP);
		}
		drawRow(page, fonts.body, cells, cursor, rowHeight);
		cursor -= rowHeight;
	}

	const pages = doc.getPages();
	pages.forEach((p, i) => {
		drawPageNumber(p, fonts.mono, i + 1, pages.length);
	});

	return doc.save({ useObjectStreams: false });
}

function drawLetterhead(
	page: PDFPage,
	letterhead: PDFEmbeddedPage,
	mono: PDFFont,
	dateLabel: string
): void {
	page.drawPage(letterhead);
	drawRightAligned(page, mono, dateLabel, META_SIZE, HEADER_BASELINE);
}

function drawPageNumber(
	page: PDFPage,
	mono: PDFFont,
	n: number,
	total: number
): void {
	const label = `Page ${String(n)} of ${String(total)}`;
	drawRightAligned(page, mono, label, FOOTER_SIZE, FOOTER_BASELINE);
}

function drawRightAligned(
	page: PDFPage,
	font: PDFFont,
	text: string,
	size: number,
	y: number
): void {
	page.drawText(text, {
		x: CONTENT_RIGHT - font.widthOfTextAtSize(text, size),
		y,
		size,
		font,
		color: MUTED,
	});
}

function drawColumnHeaders(page: PDFPage, bold: PDFFont, top: number): number {
	const y = top - LINE_HEIGHT;
	let x = CONTENT_LEFT;
	for (const col of COLUMNS) {
		page.drawText(col.header, {
			x,
			y,
			size: CELL_SIZE,
			font: bold,
			color: INK,
		});
		x += col.width + COL_GAP;
	}
	page.drawText("Description", {
		x,
		y,
		size: CELL_SIZE,
		font: bold,
		color: INK,
		maxWidth: DESCRIPTION_WIDTH,
	});
	const ruleY = y - ROW_PAD;
	page.drawLine({
		start: { x: CONTENT_LEFT, y: ruleY },
		end: { x: CONTENT_RIGHT, y: ruleY },
		thickness: 0.75,
		color: INK,
	});
	return ruleY - ROW_PAD;
}

function cellLines(font: PDFFont, item: InventoryListRow): string[][] {
	const texts = [
		item.assetTag,
		item.typeName,
		item.categoryName,
		item.description ?? "",
	];
	return texts.map((text, i) =>
		wrapText(font, text, CELL_SIZE, COLUMN_WIDTHS[i])
	);
}

function drawRow(
	page: PDFPage,
	font: PDFFont,
	cells: string[][],
	top: number,
	rowHeight: number
): void {
	let x = CONTENT_LEFT;
	for (let c = 0; c < cells.length; c++) {
		const lines = cells[c];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === "") continue;
			page.drawText(line, {
				x,
				y: top - ROW_PAD - (i + 1) * LINE_HEIGHT + 3,
				size: CELL_SIZE,
				font,
				color: INK,
				maxWidth: COLUMN_WIDTHS[c],
			});
		}
		x += COLUMN_WIDTHS[c] + COL_GAP;
	}
	page.drawLine({
		start: { x: CONTENT_LEFT, y: top - rowHeight },
		end: { x: CONTENT_RIGHT, y: top - rowHeight },
		thickness: 0.4,
		color: INK,
	});
}

function wrapText(
	font: PDFFont,
	text: string,
	size: number,
	maxWidth: number
): string[] {
	const trimmed = text.trim();
	if (trimmed === "") return [""];
	const words = trimmed.split(/\s+/);
	const lines: string[] = [];
	let current = "";
	function flush(): void {
		if (current === "") return;
		lines.push(current);
		current = "";
	}
	function pushLongWord(word: string): void {
		let rest = word;
		while (rest.length > 0) {
			let i = rest.length;
			while (
				i > 1 &&
				font.widthOfTextAtSize(rest.slice(0, i), size) > maxWidth
			) {
				i -= 1;
			}
			lines.push(rest.slice(0, i));
			rest = rest.slice(i);
		}
	}
	for (const word of words) {
		const candidate = current === "" ? word : `${current} ${word}`;
		if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
			current = candidate;
			continue;
		}
		flush();
		if (font.widthOfTextAtSize(word, size) <= maxWidth) {
			current = word;
			continue;
		}
		pushLongWord(word);
	}
	flush();
	return lines.length > 0 ? lines : [""];
}
