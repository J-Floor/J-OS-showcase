import {
	Icon,
	Morph,
	Skeleton,
	morphPart,
	morphTitle,
} from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import type { Id } from "../../../convex/_generated/dataModel";
import { ICONS } from "../../shared/icons.ts";

import { projectFields } from "./fields.ts";
import styles from "./ProjectCard.module.scss";

/** Compact project summary — name, leader, task count. Shared by the timeline's
 * label column and the "No dates set" list so both read identically. */
export function ProjectCard(props: {
	id: Id<"projects">;
	name: string;
	leaderName?: string;
	taskCount: number | undefined;
	onClick: () => void;
	/** Draws the card's own box. A box around the card belongs here, not on
	 *  a wrapper: the card is what morphs into the sheet, and a wrapper's box
	 *  would stay behind. */
	isBoxed?: boolean;
}): JSX.Element {
	return (
		<Morph
			of={props.id}
			asChild={(morph) => (
				<button
					{...morph()}
					type="button"
					class={styles.card}
					data-boxed={props.isBoxed ? "" : undefined}
					onClick={() => {
						props.onClick();
					}}
				>
					<span class={styles.name} {...morphTitle}>
						{props.name}
					</span>
					<span class={styles.meta}>
						<Show when={props.leaderName}>
							{(name) => (
								<span
									class={`${styles.item} ${styles.leader}`}
									{...morphPart(projectFields.leaderId)}
								>
									<Icon>{ICONS.person}</Icon>
									<span class={styles.leaderName}>
										{name()}
									</span>
								</span>
							)}
						</Show>
						<span class={styles.item}>
							<Icon>{ICONS.task}</Icon>
							<Show
								when={props.taskCount !== undefined}
								fallback={<Skeleton width="short" />}
							>
								{props.taskCount}
							</Show>{" "}
							tasks
						</span>
					</span>
				</button>
			)}
		/>
	);
}
