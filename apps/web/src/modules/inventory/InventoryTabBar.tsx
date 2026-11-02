import { Tabs } from "@j-os/design-system";
import { For } from "solid-js";

import { ActionButton } from "../../shared/actions/ActionButton.tsx";
import { RowActionButton } from "../../shared/actions/RowActions.tsx";
import { PAGE_TARGET } from "../../shared/actions/shortcuts.ts";

import type { createInventoryPageActions } from "./inventoryActions.ts";
import { INVENTORY_TABS } from "./inventoryTabs.ts";

/** The tab triggers, and each tab's header actions: print and scan and new
 *  item on Items, a "new" button on the other two. Every button is fed by the
 *  page's action descriptors, the same ones its keys run. */
export function InventoryTabBar(props: {
	actions: ReturnType<typeof createInventoryPageActions>;
}) {
	return (
		<Tabs.Bar>
			<Tabs.List>
				<For each={INVENTORY_TABS}>
					{(entry) => (
						<Tabs.Trigger value={entry.tab}>
							{entry.label}
						</Tabs.Trigger>
					)}
				</For>
			</Tabs.List>
			<Tabs.Actions value="items">
				<RowActionButton
					action={props.actions.printList}
					row={PAGE_TARGET}
				/>
				<ActionButton
					action={props.actions.scan}
					target={PAGE_TARGET}
					variant="secondary"
				/>
				<ActionButton
					action={props.actions.newItem}
					target={PAGE_TARGET}
				/>
			</Tabs.Actions>
			<Tabs.Actions value="types">
				<ActionButton
					action={props.actions.newType}
					target={PAGE_TARGET}
				/>
			</Tabs.Actions>
			<Tabs.Actions value="categories">
				<ActionButton
					action={props.actions.newCategory}
					target={PAGE_TARGET}
				/>
			</Tabs.Actions>
		</Tabs.Bar>
	);
}
