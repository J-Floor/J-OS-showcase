import { Dialog, Input } from "@j-os/design-system";
import { For, createSignal, type JSX } from "solid-js";

import type { OpenProps } from "../../../shared/types.ts";
import type { Item } from "../data/inventoryData.ts";

import { filterItemsByAssetTag } from "./copyFromItem.ts";
import styles from "./CopyFromItemDialog.module.scss";

/** The search and its results. Built for each opening and kept through the
 *  close (as every dialog's content is), so an idle dialog holds no list of
 *  every item, the filter stays while the card closes, and the next opening
 *  starts unfiltered. */
function CopyFromItemSearch(props: {
	items: Item[];
	onPick: (item: Item) => void;
}): JSX.Element {
	const [query, setQuery] = createSignal("");

	function matches(): Item[] {
		return filterItemsByAssetTag(props.items, query());
	}

	return (
		<Dialog.Body>
			<Input
				label="Asset tag"
				value={query()}
				onInput={(event) => {
					setQuery(event.currentTarget.value);
				}}
			/>
			<div class={styles.results}>
				<For
					each={matches()}
					fallback={
						<p class={styles.empty}>No matching asset tags</p>
					}
				>
					{(row) => (
						<button
							type="button"
							class={styles.row}
							aria-label={`${row.assetTag} ${row.typeName}`}
							onClick={() => {
								props.onPick(row);
							}}
						>
							<span class={styles.tag}>{row.assetTag}</span>
							<span class={styles.type}>{row.typeName}</span>
						</button>
					)}
				</For>
			</div>
		</Dialog.Body>
	);
}

export function CopyFromItemDialog(
	props: OpenProps & {
		items: Item[];
		onSelect: (item: Item) => void;
	}
): JSX.Element {
	function pick(item: Item) {
		props.onSelect(item);
		props.onOpenChange(false);
	}

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Copy from item</Dialog.Title>
					<Dialog.Description>
						Search by asset tag, then pick an item to copy its type
						and description.
					</Dialog.Description>
				</Dialog.Header>
				<CopyFromItemSearch items={props.items} onPick={pick} />
			</Dialog.Content>
		</Dialog.Root>
	);
}
