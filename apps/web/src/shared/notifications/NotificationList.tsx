import { Button, EmptyState, List, Query, Skeleton } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Index,
	type JSX,
	onCleanup,
	Show,
	untrack,
} from "solid-js";

import { useAbility } from "../../lib/ability.tsx";
import { canView, descriptorForLink } from "../entity/entityDescriptor.ts";
import { entityDescriptors } from "../entity/entityDescriptors.ts";
import { warmPeek } from "../entity/lazyPeek.tsx";
import { useOpenEntity } from "../entity/openEntity.ts";
import { ICONS } from "../icons.ts";
import { dayLabel, formatAgo } from "../time.ts";

import styles from "./NotificationList.module.scss";
import type { Inbox, InboxRow } from "./useInbox.ts";

function InboxLoading(): JSX.Element {
	return (
		<div class={styles.loading} role="status" aria-label="Loading">
			<Skeleton width="long" />
			<Skeleton width="medium" />
			<Skeleton width="short" />
		</div>
	);
}

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

const LOADING_MORE_ROWS = 3;

/** Placeholder rows in one card, where the next page's rows will land. Plain
 *  blocks rather than `List.Item`s, which would each add a tab stop. */
function LoadingMoreRows(): JSX.Element {
	return (
		<section
			class={`${styles.day} ${styles.noScrollAnchor}`}
			role="status"
			aria-label="Loading"
		>
			<div class={`${styles.group} ${styles.loadingMore}`}>
				<Index each={Array.from({ length: LOADING_MORE_ROWS })}>
					{() => (
						<div class={styles.skeletonRow}>
							<Skeleton width="long" />
							<Skeleton width="full" />
							<Skeleton width="short" />
						</div>
					)}
				</Index>
			</div>
		</section>
	);
}

function NotificationRow(props: {
	row: InboxRow;
	onOpen: (row: InboxRow) => void;
	onIntent: (row: InboxRow) => void;
}): JSX.Element {
	return (
		<List.Item
			class={rowClass(props.row)}
			onClick={() => {
				props.onOpen(props.row);
			}}
			onPointerEnter={() => {
				props.onIntent(props.row);
			}}
			onFocus={() => {
				props.onIntent(props.row);
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

/** Below the last row: the skeleton card while a page loads, a retry when it
 *  failed, and the sentinel that asks for the next page. */
function LoadMoreFooter(props: { inbox: Inbox }): JSX.Element {
	// No `root`: the sheet body's `overflow` clips the sentinel until it is
	// scrolled to, which the observer respects.
	const [atEnd, setAtEnd] = createSignal(false);
	function watchEnd(element: HTMLDivElement): void {
		const observer = new IntersectionObserver((entries) => {
			// An entry queued before `disconnect` can still be delivered after
			// it; a removed sentinel must not leave `atEnd` stuck true.
			setAtEnd(
				element.isConnected &&
					entries.some((entry) => entry.isIntersecting)
			);
		});
		observer.observe(element);
		onCleanup(() => {
			observer.disconnect();
			setAtEnd(false);
		});
	}

	// The sentinel is mounted only while a load may start, so each page that
	// lands mounts a fresh one. Its observer's first entry is measured after
	// the new rows are laid out: a short page that leaves it in view loads the
	// next one, a full page that pushed it away does not. Keeping one sentinel
	// would leave `atEnd` true from before the page landed and fetch twice.
	createEffect(() => {
		if (atEnd()) void untrack(() => props.inbox.loadMore());
	});
	return (
		<>
			<Show when={props.inbox.loadingMore()}>
				<LoadingMoreRows />
			</Show>
			<Show when={props.inbox.loadMoreFailed()}>
				<div class={styles.retry}>
					<p class={styles.message}>Couldn't load more.</p>
					<Button
						variant="tertiary"
						onClick={() => {
							void props.inbox.loadMore();
						}}
					>
						Try again
					</Button>
				</div>
			</Show>
			<Show
				when={
					props.inbox.canLoadMore() &&
					!props.inbox.loadingMore() &&
					!props.inbox.loadMoreFailed()
				}
			>
				<div
					ref={watchEnd}
					class={`${styles.sentinel} ${styles.noScrollAnchor}`}
				/>
			</Show>
		</>
	);
}

/** What a click on a row does: closes the sheet, opens the row's entity over
 *  the current page (or navigates to its page) and marks the row read. */
function useOpenRow(
	inbox: () => Inbox,
	onClose: () => void
): (row: InboxRow) => void {
	const navigate = useNavigate();
	const openEntity = useOpenEntity();
	const ability = useAbility();
	return (row) => {
		onClose();
		const link = descriptorForLink(row.url, entityDescriptors);
		// A kind the viewer may not peek at goes to its page, as any link does.
		if (link && canView(ability(), link.desc))
			openEntity(link.desc, link.slug);
		else navigate(row.url);
		inbox().markRead(row._id);
	};
}

/** A touch screen has no hover, so the first intent is the tap itself, too
 *  late for the handoff. Warms each kind the rows link to, once, as they show. */
function useWarmKinds(rows: () => Map<string, InboxRow>): void {
	const ability = useAbility();
	const warmed = new Set<string>();
	createEffect(() => {
		for (const row of rows().values()) {
			const link = descriptorForLink(row.url, entityDescriptors);
			if (
				!link ||
				warmed.has(link.desc.key) ||
				!canView(ability(), link.desc)
			)
				continue;
			warmed.add(link.desc.key);
			warmPeek(link.desc);
		}
	});
}

/**
 * The sheet's notification history: rows grouped by day, unread ones
 * marked. A click closes the sheet, opens the row's entity over the current
 * page (or its page) and marks it read without waiting; older rows load a page
 * at a time as the end scrolls into view.
 */
export function NotificationList(props: {
	inbox: Inbox;
	onClose: () => void;
}): JSX.Element {
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

	const open = useOpenRow(
		() => props.inbox,
		() => {
			props.onClose();
		}
	);

	/** The sheet must be loaded in time to take the close handoff. */
	function warm(row: InboxRow): void {
		const link = descriptorForLink(row.url, entityDescriptors);
		if (link) warmPeek(link.desc);
	}

	useWarmKinds(() => rows());

	return (
		<Show
			when={!props.inbox.failed()}
			fallback={
				<p class={styles.message}>Couldn't load notifications.</p>
			}
		>
			<Query.Root data={props.inbox.rows()}>
				<Query.Skeleton>
					<InboxLoading />
				</Query.Skeleton>
				<Query.Empty>
					<EmptyState
						icon={ICONS.notifications}
						title="No notifications yet"
						description="Notifications sent to you show up here for 90 days."
					/>
				</Query.Empty>
				<Query.Content of={props.inbox.rows()}>
					{() => (
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
														onIntent={warm}
													/>
												)}
											</For>
										</List.Root>
									</section>
								)}
							</For>
							<LoadMoreFooter inbox={props.inbox} />
						</div>
					)}
				</Query.Content>
			</Query.Root>
		</Show>
	);
}
