import azeretMonoRegularUrl from "../../../../agreements/static-fonts/AzeretMono-Regular.ttf?url";
import manropeBoldUrl from "../../../../agreements/static-fonts/Manrope-Bold.ttf?url";
import manropeRegularUrl from "../../../../agreements/static-fonts/Manrope-Regular.ttf?url";

import type { InventoryPdfAssets } from "./inventoryListPdf.ts";
import letterheadUrl from "./letterhead.pdf?url";

async function fetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Failed to load ${url}: ${String(response.status)}`);
	return new Uint8Array(await response.arrayBuffer());
}

/** Fetch the letterhead and brand fonts for the inventory list PDF. Called on
 * Print only, so none of it ships in the main bundle. */
export async function loadInventoryPdfAssets(): Promise<InventoryPdfAssets> {
	const [letterhead, manropeRegular, manropeBold, azeretMonoRegular] =
		await Promise.all([
			fetchBytes(letterheadUrl),
			fetchBytes(manropeRegularUrl),
			fetchBytes(manropeBoldUrl),
			fetchBytes(azeretMonoRegularUrl),
		]);
	return { letterhead, manropeRegular, manropeBold, azeretMonoRegular };
}
