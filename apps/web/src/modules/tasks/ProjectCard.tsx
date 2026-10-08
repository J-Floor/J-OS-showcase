import { Icon } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import styles from "./ProjectCard.module.scss";

/** Compact project summary — name, leader, task count. Shared by the timeline's
 * label column and the "No dates set" list so both read identically. */
export function ProjectCard(props: {
	name: string;
	leaderName?: string;
	taskCount: number;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			class={styles.card}
			onClick={() => {
				props.onClick();
			}}
		>
			<span class={styles.name}>{props.name}</span>
			<span class={styles.meta}>
				<Show when={props.leaderName}>
					{(n) => (
						<span class={styles.item}>
							<Icon>{ICONS.person}</Icon>
							{n()}
						</span>
					)}
				</Show>
				<span class={styles.item}>
					<Icon>{ICONS.task}</Icon>
					{props.taskCount} tasks
				</span>
			</span>
		</button>
	);
}
