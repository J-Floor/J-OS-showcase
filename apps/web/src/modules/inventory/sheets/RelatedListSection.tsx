import { Accordion, Query } from "@j-os/design-system";
import { For, type Accessor } from "solid-js";

import styles from "./InventorySheet.module.scss";

/**
 * The rows that belong to the open record (a category's item types, an item
 * type's items) as one collapsible, counted list.
 */
export function RelatedListSection<Row>(props: {
	/** The accordion item's value. */
	value: string;
	title: string;
	emptyText: string;
	rows: Accessor<Row[] | undefined>;
	label: (row: Row) => string;
	openSection: Accessor<string[]>;
	onOpenSectionChange: (sections: string[]) => void;
}) {
	return (
		<Accordion.Root
			value={props.openSection()}
			onValueChange={(details) => {
				props.onOpenSectionChange(details.value);
			}}
		>
			<Query.Root data={props.rows()}>
				<Accordion.Item value={props.value}>
					<Accordion.ItemTitle>
						{props.title} (<Query.Count />)
					</Accordion.ItemTitle>
					<Accordion.ItemContent>
						<div class={styles.section}>
							<Query.Empty>
								<p class={styles.empty}>{props.emptyText}</p>
							</Query.Empty>
							<Query.Content of={props.rows()}>
								{(rows) => (
									<ul class={styles.list}>
										<For each={rows()}>
											{(row) => (
												<li class={styles.listRow}>
													{props.label(row)}
												</li>
											)}
										</For>
									</ul>
								)}
							</Query.Content>
						</div>
					</Accordion.ItemContent>
				</Accordion.Item>
			</Query.Root>
		</Accordion.Root>
	);
}
