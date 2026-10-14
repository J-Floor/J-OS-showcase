import { PermissionDenied, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";

import { Can } from "../../lib/ability.tsx";

import {
	TAB_KEYS,
	activeInventoryTab,
	createInventorySelections,
	type InventoryTabKey,
} from "./createInventorySelections.ts";
import styles from "./InventoryPage.module.scss";
import { InventoryTabBar } from "./InventoryTabBar.tsx";
import { createInventoryScanner } from "./scan/createInventoryScanner.ts";
import { QrScannerDialog } from "./scan/QrScannerDialog.tsx";
import { CategoriesTab } from "./tabs/CategoriesTab.tsx";
import { ItemsTab } from "./tabs/ItemsTab.tsx";
import { ItemTypesTab } from "./tabs/ItemTypesTab.tsx";

/** Board/admin inventory console: items, types, and categories. */
export function InventoryPage() {
	const [params, setParams] = useSearchParams();

	function activeTab(): InventoryTabKey {
		return activeInventoryTab(params.tab);
	}

	const selections = createInventorySelections({ activeTab, setParams });
	const {
		itemRows,
		itemSelection,
		typeSelection,
		categorySelection,
		newItemTag,
		openNewItem,
	} = selections;
	const scanner = createInventoryScanner({ ...selections, setParams });

	return (
		<Can I="view" the="Inventory" fallback={<PermissionDenied />}>
			<Tabs.Root
				class={styles.console}
				lazyMount
				urlParam={{
					get: () => params.tab,
					set: (value) => {
						// Only ever called for a tab the USER picked (zag emits
						// `onValueChange` from its own events, never from a
						// controlled value change). All three tabs stay mounted
						// once visited, so an open drawer is a Portal floating
						// over whatever tab is now on screen — close it. And
						// clear all three link params explicitly: a selection's
						// own `close()` only writes the URL while it is still the
						// active tab, so the other two would otherwise keep a
						// stale `?type=`/`?category=` that silently reopens the
						// wrong drawer when the user switches back to them.
						selections.closeAll();
						setParams({
							tab: value,
							item: undefined,
							type: undefined,
							category: undefined,
						});
					},
					fallback: "items",
					keys: TAB_KEYS,
				}}
			>
				<InventoryTabBar
					itemRows={itemRows}
					onScan={scanner.openScanner}
					onNewItem={() => {
						openNewItem();
					}}
					onNewType={() => {
						typeSelection.openCreate();
					}}
					onNewCategory={() => {
						categorySelection.openCreate();
					}}
				/>
				<Tabs.Content value="items" class={styles.panel}>
					<ItemsTab
						selection={itemSelection}
						newItemAssetTag={newItemTag}
					/>
				</Tabs.Content>
				<Tabs.Content value="types" class={styles.panel}>
					<ItemTypesTab selection={typeSelection} />
				</Tabs.Content>
				<Tabs.Content value="categories" class={styles.panel}>
					<CategoriesTab selection={categorySelection} />
				</Tabs.Content>
			</Tabs.Root>
			<QrScannerDialog
				open={scanner.scanOpen()}
				onOpenChange={(isOpen) => {
					if (isOpen) scanner.setScanOpen(true);
					else scanner.closeScanner();
				}}
				onDetect={(raw) => {
					void scanner.onDetect(raw);
				}}
				error={scanner.scanError()}
				unknownTag={scanner.unknownTag()}
				onCancelUnknown={scanner.closeScanner}
				onAddUnknown={scanner.addUnknown}
			/>
		</Can>
	);
}
