import {
	Button,
	Deferred,
	Icon,
	SkeletonList,
	Tooltip,
} from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import styles from "./SpaceCard.module.scss";

const DEFAULT_SKELETON_ROWS = 2;

export type SpaceCardProps = {
	title: string;
	/** Hover-help for the title. Omit it and no help icon renders. */
	helpText?: string;
	/** A short muted line under the title, inside the header block. */
	subtitle?: string;
	/** A control at the end of the title row, after the help icon (e.g. an
	 *  "Edit" button). */
	headerAction?: JSX.Element;
	icon?: string;
	children?: JSX.Element;
	note?: JSX.Element;
	actionLabel?: string;
	onAction?: () => void;
	actionLoading?: boolean;
	/** The card's data is not here yet: the title stays, the body shows
	 *  `skeleton` (else a short list of bars) as a "Loading" status, and the
	 *  header action, `note` and the action button wait. */
	loading?: boolean;
	skeleton?: JSX.Element;
};

/**
 * The shared Space-page card shell: a title with an optional hover-help
 * tooltip, an optional header action and an optional subtitle, a centered body (custom `children`, else the
 * `icon` ligature), an optional `note` (status line), and an optional
 * full-width action button.
 */
export function SpaceCard(props: SpaceCardProps): JSX.Element {
	return (
		<section class={styles.card}>
			<header class={styles.header}>
				<div class={styles.titleRow}>
					<h2 class={styles.title}>{props.title}</h2>
					<div class={styles.trailing}>
						<Show when={props.helpText}>
							{(helpText) => (
								<Tooltip
									tooltipContent={helpText()}
									class={styles.help}
									asChild={(triggerProps) => (
										<span
											{...triggerProps()}
											tabIndex={0}
										/>
									)}
								>
									<Icon>{ICONS.help}</Icon>
								</Tooltip>
							)}
						</Show>
						<Show when={!props.loading}>{props.headerAction}</Show>
					</div>
				</div>
				<Show when={props.subtitle}>
					<p class={styles.subtitle}>{props.subtitle}</p>
				</Show>
			</header>
			<div class={styles.body}>
				<Show
					when={!props.loading}
					fallback={
						<Deferred fallback={null}>
							<Show
								when={props.skeleton}
								fallback={
									<SkeletonList
										rows={DEFAULT_SKELETON_ROWS}
									/>
								}
							>
								{(skeleton) => (
									<div role="status" aria-label="Loading">
										{skeleton()}
									</div>
								)}
							</Show>
						</Deferred>
					}
				>
					<Show
						when={props.children}
						fallback={<Icon>{props.icon ?? "widgets"}</Icon>}
					>
						{props.children}
					</Show>
				</Show>
			</div>
			<Show when={!props.loading}>{props.note}</Show>
			<Show when={props.actionLabel && !props.loading}>
				<Button
					class={styles.action}
					isLoading={props.actionLoading}
					onClick={() => props.onAction?.()}
				>
					{props.actionLabel}
				</Button>
			</Show>
		</section>
	);
}
