import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { type Accessor, createMemo, createSignal } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { NOTIFICATIONS_PAGE_SIZE } from "../../../convex/lib/constants.ts";
import { call } from "../../lib/call.ts";
import { useFlooredLog } from "../data/useFlooredLog.ts";
import { toaster } from "../toaster.ts";

/** One history row as the inbox queries return it. */
export type InboxRow = FunctionReturnType<
	typeof api.notify.inbox.listSince
>[number];

export type Inbox = {
	/** The live head, then the older pages, newest first; undefined until the
	 *  head has loaded. */
	rows: Accessor<InboxRow[] | undefined>;
	failed: Accessor<boolean>;
	canLoadMore: Accessor<boolean>;
	loadingMore: Accessor<boolean>;
	loadMoreFailed: Accessor<boolean>;
	loadMore: () => Promise<void>;
	markRead: (id: Id<"notifications">) => void;
	markAllRead: () => void;
};

function withReadState(
	prev: ReadonlySet<string>,
	ids: readonly string[],
	isRead: boolean
): ReadonlySet<string> {
	const next = new Set(prev);
	for (const id of ids) {
		if (isRead) next.add(id);
		else next.delete(id);
	}
	return next;
}

/**
 * The caller's notification history, paged like the door log
 * (`useFlooredLog`): the floor is read on the first open (the drawer is
 * mounted for the whole shell, so not at app start). Read state shows at once
 * and rolls back if the server refuses.
 */
export function useInbox(open: Accessor<boolean>): Inbox {
	const markReadMutation = useMutation(api.notify.inbox.markRead);
	const markAllReadMutation = useMutation(api.notify.inbox.markAllRead);
	const log = useFlooredLog({
		queries: api.notify.inbox,
		pageSize: NOTIFICATIONS_PAGE_SIZE,
		start: open,
	});
	const [readLocally, setReadLocally] = createSignal<ReadonlySet<string>>(
		new Set()
	);

	const rows = createMemo<InboxRow[] | undefined>(() => {
		const local = readLocally();
		return log
			.rows()
			?.map((row) =>
				!row.read && local.has(row._id) ? { ...row, read: true } : row
			);
	});

	// A failed mark undoes only the ids no other mark still holds: one that is
	// still in flight, or that the server already confirmed.
	const pending = new Map<string, number>();
	const confirmed = new Set<string>();

	function setRead(ids: readonly string[], isRead: boolean): void {
		setReadLocally((prev) => withReadState(prev, ids, isRead));
	}

	async function mark(
		ids: readonly string[],
		mutate: () => Promise<unknown>,
		fallback: string
	): Promise<void> {
		for (const id of ids) pending.set(id, (pending.get(id) ?? 0) + 1);
		setRead(ids, true);
		const result = await call(mutate(), fallback);
		for (const id of ids) pending.set(id, (pending.get(id) ?? 1) - 1);
		if (result.isOk()) {
			for (const id of ids) confirmed.add(id);
			return;
		}
		setRead(
			ids.filter((id) => !confirmed.has(id) && !pending.get(id)),
			false
		);
		// The rows are in a drawer that may be closed, and a failed mark-read
		// must not block the navigation: a toast is where it can be seen.
		toaster.create({ type: "error", title: result.error.message });
	}

	function markRead(id: Id<"notifications">): void {
		void mark(
			[id],
			() => markReadMutation.mutateAsync({ id }),
			"Could not mark that as read."
		);
	}

	function markAllRead(): void {
		// Server state, not the overlay: a row a pending markRead already shows
		// read is still covered by this call.
		const ids = (log.rows() ?? [])
			.filter((row) => !row.read)
			.map((row) => row._id);
		void mark(
			ids,
			() => markAllReadMutation.mutateAsync({}),
			"Could not mark everything as read."
		);
	}

	return {
		rows,
		failed: log.failed,
		canLoadMore: log.canLoadMore,
		loadingMore: log.loadingMore,
		loadMoreFailed: log.loadMoreFailed,
		loadMore: log.loadMore,
		markRead,
		markAllRead,
	};
}
