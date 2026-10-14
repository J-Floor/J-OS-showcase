import { Button, EmptyState, List } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import { createMemo, For, type JSX, Show } from "solid-js";

import { ICONS } from "../icons.ts";
import { dayLabel, formatAgo } from "../time.ts";

import styles from "./NotificationList.module.scss";
import type { Inbox, InboxRow } from "./useInbox.ts";

/** Rows (newest first) under one label per local day, in day order. */
function groupByDay(rows: InboxRow[], now: number): Map<string, InboxRow[]> {
	const groups = new Map<string, InboxRow[]>();
	for (const row of rows) {
		const day = dayLabel(row.createdAt, now);
		const group = groups.get(day);
		if (group) group.push(row);
		else groups.set(day, [row]);
	}
	return groups;
}

function sameRow(left: InboxRow, right: InboxRow): boolean {
	return (
		left.title === right.title &&
		left.body === right.body &&
		left.url === right.url &&
		left.createdAt === right.createdAt &&
		left.read === right.read
	);
}

function rowClass(row: InboxRow): string {
	return row.read ? styles.row : `${styles.row} ${styles.unread}`;
}

function NotificationRow(props: {
	row: InboxRow;
	onOpen: (row: InboxRow) => void;
}): JSX.Element {
	return (
		<List.Item
			class={rowClass(props.row)}
			onClick={() => {
				props.onOpen(props.row);
			}}
		>
			<List.ItemTitle class={styles.title}>
				{props.row.title}
			</List.ItemTitle>
			<List.ItemDescription wrap>{props.row.body}</List.ItemDescription>
			<span class={styles.time}>{formatAgo(props.row.createdAt)}</span>
			<Show when={!props.row.read}>
				<span class={styles.srOnly}>Unread</span>
			</Show>
		</List.Item>
	);
}

/**
 * The drawer's notification history: rows grouped by day, unread ones
 * marked. A click closes the drawer, opens the row's page and marks it read
 * without waiting; older rows load a page at a time.
 */
export function NotificationList(props: {
	inbox: Inbox;
	onClose: () => void;
}): JSX.Element {
	const navigate = useNavigate();
	// An unchanged row keeps its object, so `<For>` keeps its DOM when the
	// live head refetches.
	const rows = createMemo<Map<string, InboxRow>>((previous) => {
		const next = new Map<string, InboxRow>();
		const inboxRows = props.inbox.rows() ?? [];
		for (const row of inboxRows) {
			const prior = previous.get(row._id);
			next.set(row._id, prior && sameRow(prior, row) ? prior : row);
		}
		return next;
	}, new Map());
	const groups = createMemo(() =>
		groupByDay([...rows().values()], Date.now())
	);

	function open(row: InboxRow): void {
		props.onClose();
		navigate(row.url);
		props.inbox.markRead(row._id);
	}

	return (
		<Show
			when={!props.inbox.failed()}
			fallback={
				<p class={styles.message}>Couldn't load notifications.</p>
			}
		>
			<Show when={props.inbox.rows() !== undefined}>
				<Show
					when={groups().size > 0}
					fallback={
						<EmptyState
							icon={ICONS.notifications}
							title="No notifications yet"
							description="Notifications sent to you show up here for 90 days."
						/>
					}
				>
					<div class={styles.list}>
						<For each={[...groups().keys()]}>
							{(day) => (
								<section class={styles.day}>
									<h3 class={styles.dayHeading}>{day}</h3>
									<List.Root class={styles.group}>
										<For each={groups().get(day)}>
											{(row) => (
												<NotificationRow
													row={row}
													onOpen={open}
												/>
											)}
										</For>
									</List.Root>
								</section>
							)}
						</For>
						<Show when={props.inbox.canLoadMore()}>
							<Button
								variant="tertiary"
								isLoading={props.inbox.loadingMore()}
								onClick={() => {
									void props.inbox.loadMore();
								}}
							>
								{props.inbox.loadMoreFailed()
									? "Couldn't load more. Try again."
									: "Load more"}
							</Button>
						</Show>
					</div>
				</Show>
			</Show>
		</Show>
	);
}
