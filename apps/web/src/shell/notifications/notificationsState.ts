import { createSignal } from "solid-js";

/** The Notifications sheet's tabs. */
export const NOTIFICATIONS_TABS = ["inbox", "categories"] as const;

export type NotificationsTab = (typeof NOTIFICATIONS_TABS)[number];

/** One sheet for the whole shell: the topbar bell, the folded topbar menu and the
 *  `?notifications=open` deep link all open the same instance. */
const [open, setOpen] = createSignal(false);
/** The tab this open lands on: Inbox, except from the email footer's
 *  "Manage notifications" link, which opens Categories. */
const [tab, setTab] = createSignal<NotificationsTab>("inbox");

export const isNotificationsOpen = open;
export const notificationsTab = tab;

export function openNotifications(
	options: { tab?: NotificationsTab } = {}
): void {
	setTab(options.tab ?? "inbox");
	setOpen(true);
}

export function setNotificationsOpen(isOpen: boolean): void {
	setOpen(isOpen);
}
