import { Result, ResultAsync } from "neverthrow";

import { toaster } from "../../../shared/toaster.ts";
import type { Item } from "../data/inventoryData.ts";

import { downloadPdf } from "./downloadPdf.ts";
import {
	generateInventoryListPdf,
	inventoryListPdfFilename,
} from "./inventoryListPdf.ts";
import { loadInventoryPdfAssets } from "./inventoryPdfAssets.ts";

const PRINT_FAILED = "Could not print the list. Try again.";

const download = Result.fromThrowable(downloadPdf);

/**
 * Render `rows` to an Inventory List PDF and trigger a browser download. A
 * failure has no area of its own (the buttons are in a toolbar and a batch
 * bar), so it is a toast; this never rejects.
 *
 * Shared by the Items tab's batch action (prints the checked rows) and the
 * toolbar Print button (prints the whole list). Rows are drawn in the order
 * given — `generateInventoryListPdf` does not sort — so the caller decides the
 * order (the toolbar passes the list in its query order).
 */
export async function printInventoryList(rows: Item[]): Promise<void> {
	const now = new Date();
	const printed = await ResultAsync.fromPromise(
		loadInventoryPdfAssets(),
		() => PRINT_FAILED
	)
		.andThen((assets) => assets.mapErr(() => PRINT_FAILED))
		.andThen((assets) =>
			ResultAsync.fromPromise(
				generateInventoryListPdf(rows, { now, assets }),
				() => PRINT_FAILED
			)
		)
		.andThen((bytes) =>
			download(bytes, inventoryListPdfFilename(now)).mapErr(
				() => PRINT_FAILED
			)
		);
	if (printed.isErr())
		toaster.create({ type: "error", title: printed.error });
}
