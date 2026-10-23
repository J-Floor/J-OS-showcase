import { Button, Icon, IconButton, Tabs } from "@j-os/design-system";
import type { Accessor } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import type { Item } from "./data/inventoryData.ts";
import { printInventoryList } from "./print/printInventoryList.ts";

/** The tab triggers, and each tab's header actions: print and scan and new
 *  item on Items, a "new" button on the other two. */
export function InventoryTabBar(props: {
	itemRows: Accessor<Item[] | undefined>;
	onScan: () => void;
	onNewItem: () => void;
	onNewType: () => void;
	onNewCategory: () => void;
}) {
	function printAll() {
		// Prints the whole list in its query order (the PDF renderer does not
		// sort). The batch action in ItemsTab prints only the checked rows; this
		// toolbar button is the "print everything" shortcut.
		void printInventoryList(props.itemRows() ?? []);
	}

	return (
		<Tabs.Bar>
			<Tabs.List>
				<Tabs.Trigger value="items">Items</Tabs.Trigger>
				<Tabs.Trigger value="types">Item types</Tabs.Trigger>
				<Tabs.Trigger value="categories">Categories</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Actions value="items">
				<IconButton
					tooltipLabel="Print inventory list"
					disabled={(props.itemRows()?.length ?? 0) === 0}
					disabledReason={
						props.itemRows() === undefined
							? "Loading items…"
							: "No items to print"
					}
					onClick={printAll}
				>
					{ICONS.print}
				</IconButton>
				<Button variant="secondary" onClick={props.onScan}>
					<Icon>qr_code_scanner</Icon> Scan QR
				</Button>
				<Button onClick={props.onNewItem}>
					<Icon>{ICONS.add}</Icon> New item
				</Button>
			</Tabs.Actions>
			<Tabs.Actions value="types">
				<Button onClick={props.onNewType}>
					<Icon>{ICONS.add}</Icon> New item type
				</Button>
			</Tabs.Actions>
			<Tabs.Actions value="categories">
				<Button onClick={props.onNewCategory}>
					<Icon>{ICONS.add}</Icon> New category
				</Button>
			</Tabs.Actions>
		</Tabs.Bar>
	);
}
