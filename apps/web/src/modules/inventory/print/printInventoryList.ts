import type { Item } from "../data/inventoryData.ts";

import { downloadPdf } from "./downloadPdf.ts";
import {
	generateInventoryListPdf,
	inventoryListPdfFilename,
} from "./inventoryListPdf.ts";
import { loadInventoryPdfAssets } from "./inventoryPdfAssets.ts";

/**
 * Render `rows` to an Inventory List PDF and trigger a browser download.
 *
 * Shared by the Items tab's batch action (prints the checked rows) and the
 * toolbar Print button (prints the whole list). Rows are drawn in the order
 * given — `generateInventoryListPdf` does not sort — so the caller decides the
 * order (the toolbar passes the list in its query order).
 */
export async function printInventoryList(rows: Item[]): Promise<void> {
	try {
		const now = new Date();
		const assets = await loadInventoryPdfAssets();
		const bytes = await generateInventoryListPdf(rows, { now, assets });
		downloadPdf(bytes, inventoryListPdfFilename(now));
	} catch (err) {
		// eslint-disable-next-line no-console -- callers fire this without awaiting, so a failed fetch is logged rather than left unhandled
		console.error("[inventory] could not print the list", err);
	}
}
