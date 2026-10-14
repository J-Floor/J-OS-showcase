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

const COLOR_CHANNEL_MAX = 255;
const INK_LEVEL = 0x1a;
const MUTED_LEVEL = 0x66;
const INK = rgb(
	INK_LEVEL / COLOR_CHANNEL_MAX,
	INK_LEVEL / COLOR_CHANNEL_MAX,
	INK_LEVEL / COLOR_CHANNEL_MAX
);
const MUTED = rgb(
	MUTED_LEVEL / COLOR_CHANNEL_MAX,
	MUTED_LEVEL / COLOR_CHANNEL_MAX,
	MUTED_LEVEL / COLOR_CHANNEL_MAX
);
const META_SIZE = 9;
const FOOTER_SIZE = 8;
const CELL_SIZE = 9;
const LINE_HEIGHT = 12;
const ROW_PAD = 4;
const COL_GAP = 8;
const TEXT_BASELINE_LIFT = 3;

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
	options: { now?: Date; assets: InventoryPdfAssets }
): Promise<Uint8Array> {
	const now = options.now ?? new Date();
	const doc = await PDFDocument.create();
	doc.setTitle("Inventory List");
	doc.registerFontkit(fontkit);
	const fonts: Fonts = {
		body: await doc.embedFont(options.assets.manropeRegular, {
			subset: true,
		}),
		bold: await doc.embedFont(options.assets.manropeBold, { subset: true }),
		mono: await doc.embedFont(options.assets.azeretMonoRegular, {
			subset: true,
		}),
	};
	const [letterhead] = await doc.embedPdf(options.assets.letterhead);
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
			Math.max(...cells.map((cell) => cell.length), 1) * LINE_HEIGHT;
		if (cursor - rowHeight < CONTENT_BOTTOM) {
			page = newPage();
			cursor = drawColumnHeaders(page, fonts.bold, CONTENT_TOP);
		}
		drawRow(page, fonts.body, cells, { top: cursor, height: rowHeight });
		cursor -= rowHeight;
	}

	const pages = doc.getPages();
	pages.forEach((pdfPage, index) => {
		drawPageNumber(pdfPage, fonts.mono, index + 1, pages.length);
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
	drawRightAligned(page, dateLabel, {
		font: mono,
		size: META_SIZE,
		y: HEADER_BASELINE,
	});
}

function drawPageNumber(
	page: PDFPage,
	mono: PDFFont,
	pageNumber: number,
	total: number
): void {
	const label = `Page ${String(pageNumber)} of ${String(total)}`;
	drawRightAligned(page, label, {
		font: mono,
		size: FOOTER_SIZE,
		y: FOOTER_BASELINE,
	});
}

function drawRightAligned(
	page: PDFPage,
	text: string,
	style: { font: PDFFont; size: number; y: number }
): void {
	const { font, size, y } = style;
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
	return texts.map((text, index) =>
		wrapText(font, text, CELL_SIZE, COLUMN_WIDTHS[index])
	);
}

function drawRow(
	page: PDFPage,
	font: PDFFont,
	cells: string[][],
	row: { top: number; height: number }
): void {
	const { top, height: rowHeight } = row;
	let x = CONTENT_LEFT;
	for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
		const lines = cells[cellIndex];
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index];
			if (line === "") continue;
			page.drawText(line, {
				x,
				y:
					top -
					ROW_PAD -
					(index + 1) * LINE_HEIGHT +
					TEXT_BASELINE_LIFT,
				size: CELL_SIZE,
				font,
				color: INK,
				maxWidth: COLUMN_WIDTHS[cellIndex],
			});
		}
		x += COLUMN_WIDTHS[cellIndex] + COL_GAP;
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
			let index = rest.length;
			while (
				index > 1 &&
				font.widthOfTextAtSize(rest.slice(0, index), size) > maxWidth
			) {
				index -= 1;
			}
			lines.push(rest.slice(0, index));
			rest = rest.slice(index);
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
