import { ResultAsync } from "neverthrow";
import { createSignal } from "solid-js";

import { useConfirm } from "../../../shared/confirm.tsx";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import type { SetParams } from "../../../shared/types.ts";
import type { Item } from "../data/inventoryData.ts";
import { useLookupItemByAssetTag } from "../data/inventoryData.ts";

import { resolveScannedTag, type ScanResolution } from "./resolveScannedTag.ts";

const INVALID_QR = "This QR isn't an asset tag (expected e.g. A00000).";

/**
 * The QR scanner dialog's state and what a scan does: an invalid code shows an
 * error, a known tag opens that item, an unknown tag closes the scanner and
 * asks whether to add it.
 */
export function createInventoryScanner(options: {
	itemRows: () => Item[] | undefined;
	itemSelection: Pick<EntitySelection<Item>, "openRow">;
	openNewItem: (assetTag: string) => void;
	setParams: SetParams;
}) {
	const [scanOpen, setScanOpen] = createSignal(false);
	const [scanError, setScanError] = createSignal<string>();
	const confirm = useConfirm();
	const lookup = useLookupItemByAssetTag();
	let isScanBusy = false;

	function closeScanner() {
		isScanBusy = false;
		setScanOpen(false);
		setScanError(undefined);
	}

	function openScanner() {
		isScanBusy = false;
		setScanError(undefined);
		setScanOpen(true);
	}

	/** Opens the scanned item, from our subscription when it has the row. */
	function openScannedItem(
		result: Extract<ScanResolution, { kind: "open" }>
	) {
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
		const resolved = await ResultAsync.fromPromise(
			resolveScannedTag(raw, lookup),
			() => "Could not look up that asset tag."
		);
		if (resolved.isErr()) {
			setScanError(resolved.error);
			isScanBusy = false;
			return;
		}
		const result = resolved.value;
		if (result.kind === "invalid") {
			setScanError(INVALID_QR);
			isScanBusy = false;
			return;
		}
		if (result.kind === "open") {
			openScannedItem(result);
			return;
		}
		closeScanner();
		const isAdd = await confirm({
			title: `No item for ${result.assetTag}`,
			message:
				"Nothing is registered under this asset tag. Add a new item with this tag?",
			confirmLabel: "Add item",
		});
		if (isAdd) options.openNewItem(result.assetTag);
	}

	return {
		scanOpen,
		setScanOpen,
		scanError,
		closeScanner,
		openScanner,
		onDetect,
	};
}
