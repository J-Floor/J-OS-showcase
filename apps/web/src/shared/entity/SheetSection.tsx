import { Accordion } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import styles from "./SheetSection.module.scss";

/** One accordion section of an entity sheet ("Details", "Requests"): its
 *  title, an optional subtitle (a count), and its content stacked one item
 *  under the other. */
export function SheetSection(props: {
	value: string;
	title: string;
	subtitle?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<Accordion.Item value={props.value}>
			<Accordion.ItemTitle>
				{props.title}
				<Show when={props.subtitle}>
					<Accordion.ItemSubtitle>
						{props.subtitle}
					</Accordion.ItemSubtitle>
				</Show>
			</Accordion.ItemTitle>
			<Accordion.ItemContent>
				<div class={styles.section}>{props.children}</div>
			</Accordion.ItemContent>
		</Accordion.Item>
	);
}
