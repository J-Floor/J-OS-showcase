import { useQuery } from "convex-solidjs";

import { api } from "../../../convex/_generated/api";
import { UNREAD_COUNT_CAP } from "../../../convex/lib/constants.ts";

/** Badge text for an unread count: nothing at zero, `99+` past the cap. */
export function unreadBadge(count: number | undefined): string | undefined {
	if (count === undefined || count === 0) return undefined;
	return count > UNREAD_COUNT_CAP
		? `${String(UNREAD_COUNT_CAP)}+`
		: String(count);
}

export type UnreadBadge = {
	count: () => number;
	badge: () => string | undefined;
	label: () => string | undefined;
};

/**
 * The caller's unread notification count, live, as badge text and the label
 * that joins the button's accessible name. `enabled` gates the query: staff
 * have no notifications to count. A failed query shows no badge.
 */
export function useUnreadBadge(
	enabled: () => boolean = () => true
): UnreadBadge {
	const unread = useQuery(api.notify.inbox.unreadCount, {}, () => ({
		enabled: enabled(),
	}));
	function count(): number {
		return unread.data() ?? 0;
	}
	function badge(): string | undefined {
		return unreadBadge(unread.data());
	}
	function label(): string | undefined {
		const text = badge();
		return text === undefined ? undefined : `${text} unread`;
	}
	return { count, badge, label };
}
