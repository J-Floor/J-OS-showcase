import type { useSearchParams } from "@solidjs/router";
import { createSignal } from "solid-js";

import type { Item } from "../data/inventoryData.ts";
import { useLookupItemByAssetTag } from "../data/inventoryData.ts";

import { resolveScannedTag } from "./resolveScannedTag.ts";

const INVALID_QR = "This QR isn't an asset tag (expected e.g. A00000).";

type SetParams = ReturnType<typeof useSearchParams>[1];

/**
 * The QR scanner dialog's state and what a scan does: an invalid code shows an
 * error, a known tag opens that item, an unknown tag asks whether to add it.
 */
export function createInventoryScanner(options: {
	itemRows: () => Item[] | undefined;
	itemSelection: { openRow: (row: Item) => void };
	openNewItem: (assetTag: string) => void;
	setParams: SetParams;
}) {
	const [scanOpen, setScanOpen] = createSignal(false);
	const [scanError, setScanError] = createSignal<string>();
	const [unknownTag, setUnknownTag] = createSignal<string>();
	const lookup = useLookupItemByAssetTag();
	let isScanBusy = false;

	function closeScanner() {
		isScanBusy = false;
		setScanOpen(false);
		setScanError(undefined);
		setUnknownTag(undefined);
	}

	function openScanner() {
		isScanBusy = false;
		setScanError(undefined);
		setUnknownTag(undefined);
		setScanOpen(true);
	}

	/** Opens the scanned item, from our subscription when it has the row. */
	function openScannedItem(result: { id: string; assetTag: string }) {
		closeScanner();
		const row = options
			.itemRows()
			?.find((candidate) => candidate._id === result.id);
		if (row) {
			options.itemSelection.openRow(row);
		} else {
			// Lookup confirmed the item exists server-side but our own
			// subscription hasn't caught up yet — write the URL param
			// directly and let the selection's inbound effect open it
			// once the row is in `itemRows()`.
			options.setParams(
				{ tab: "items", item: result.assetTag },
				{ replace: true }
			);
		}
	}

	async function onDetect(raw: string) {
		if (isScanBusy) return;
		isScanBusy = true;
		try {
			const result = await resolveScannedTag(raw, lookup);
			if (result.kind === "invalid") {
				setScanError(INVALID_QR);
				isScanBusy = false;
				return;
			}
			if (result.kind === "open") {
				openScannedItem(result);
				return;
			}
			setScanError(undefined);
			setUnknownTag(result.assetTag);
		} catch {
			setScanError("Could not look up that asset tag.");
			isScanBusy = false;
		}
	}

	return {
		scanOpen,
		setScanOpen,
		scanError,
		unknownTag,
		closeScanner,
		openScanner,
		onDetect,
		/** The scanned tag has no item: closes the scanner and starts a new
		 *  item with that tag. */
		addUnknown: (): void => {
			const tag = unknownTag();
			closeScanner();
			if (tag !== undefined) options.openNewItem(tag);
		},
	};
}
