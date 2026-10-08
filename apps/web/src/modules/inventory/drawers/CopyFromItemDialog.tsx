import { Dialog, Input } from "@j-os/design-system";
import { For, Show, createEffect, createSignal, type JSX } from "solid-js";

import type { Item } from "../data/inventoryData.ts";

import { filterItemsByAssetTag } from "./copyFromItem.ts";
import styles from "./CopyFromItemDialog.module.scss";

export function CopyFromItemDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: Item[];
	onSelect: (item: Item) => void;
}): JSX.Element {
	const [query, setQuery] = createSignal("");

	createEffect(() => {
		if (!props.open) setQuery("");
	});

	function matches(): Item[] {
		return filterItemsByAssetTag(props.items, query());
	}

	function pick(item: Item) {
		props.onSelect(item);
		props.onOpenChange(false);
	}

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(d) => {
				props.onOpenChange(d.open);
			}}
		>
			<Dialog.Content>
				<Dialog.Title>Copy from item</Dialog.Title>
				<Show when={props.open}>
					<Dialog.Description>
						Search by asset tag, then pick an item to copy its type
						and description.
					</Dialog.Description>
					<Input
						label="Asset tag"
						value={query()}
						onInput={(e) => {
							setQuery(e.currentTarget.value);
						}}
					/>
					<div class={styles.results}>
						<For
							each={matches()}
							fallback={
								<p class={styles.empty}>
									No matching asset tags
								</p>
							}
						>
							{(row) => (
								<button
									type="button"
									class={styles.row}
									aria-label={`${row.assetTag} ${row.typeName}`}
									onClick={() => {
										pick(row);
									}}
								>
									<span class={styles.tag}>
										{row.assetTag}
									</span>
									<span class={styles.type}>
										{row.typeName}
									</span>
								</button>
							)}
						</For>
					</div>
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
