import { err, ok, Result, ResultAsync } from "neverthrow";

import azeretMonoRegularUrl from "../../../../agreements/static-fonts/AzeretMono-Regular.ttf?url";
import manropeBoldUrl from "../../../../agreements/static-fonts/Manrope-Bold.ttf?url";
import manropeRegularUrl from "../../../../agreements/static-fonts/Manrope-Regular.ttf?url";

import type { InventoryPdfAssets } from "./inventoryListPdf.ts";
import letterheadUrl from "./letterhead.pdf?url";

export type AssetLoadFailure = { url: string; status?: number };

async function fetchBytes(
	url: string
): Promise<Result<Uint8Array, AssetLoadFailure>> {
	const loaded = await ResultAsync.fromPromise(
		fetch(url).then(async (response) =>
			response.ok
				? ok(new Uint8Array(await response.arrayBuffer()))
				: err<Uint8Array, AssetLoadFailure>({
						url,
						status: response.status,
					})
		),
		(): AssetLoadFailure => ({ url })
	);
	return loaded.andThen((result) => result);
}

/** Fetch the letterhead and brand fonts for the inventory list PDF. Called on
 * Print only, so none of it ships in the main bundle. */
export async function loadInventoryPdfAssets(): Promise<
	Result<InventoryPdfAssets, AssetLoadFailure>
> {
	const [letterhead, manropeRegular, manropeBold, azeretMonoRegular] =
		await Promise.all([
			fetchBytes(letterheadUrl),
			fetchBytes(manropeRegularUrl),
			fetchBytes(manropeBoldUrl),
			fetchBytes(azeretMonoRegularUrl),
		]);
	return Result.combine([
		letterhead,
		manropeRegular,
		manropeBold,
		azeretMonoRegular,
	]).map(([letterheadBytes, regular, bold, mono]) => ({
		letterhead: letterheadBytes,
		manropeRegular: regular,
		manropeBold: bold,
		azeretMonoRegular: mono,
	}));
}
