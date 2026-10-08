import { Button, Drawer, Skeleton, Tabs } from "@j-os/design-system";
import { createEffect, createSignal, type JSX, Show, untrack } from "solid-js";

import { NotificationCategories } from "./NotificationCategories.tsx";
import { NotificationDeviceRow } from "./NotificationDeviceRow.tsx";
import { NotificationList } from "./NotificationList.tsx";
import styles from "./NotificationsDrawer.module.scss";
import {
	NOTIFICATIONS_TABS,
	type NotificationsTab,
} from "./notificationsState.ts";
import { useUnreadBadge } from "./unread.ts";
import { useInbox } from "./useInbox.ts";
import { usePushDevice } from "./usePushDevice.ts";

function isNotificationsTab(value: string): value is NotificationsTab {
	const tabs: readonly string[] = NOTIFICATIONS_TABS;
	return tabs.includes(value);
}

/**
 * The Notifications drawer: this device's push switch, always in view, then
 * the Inbox and Categories tabs. Each open lands on the tab it asks for. Only
 * the Inbox tab waits for the inbox to load.
 */
export function NotificationsDrawer(props: {
	open: boolean;
	tab: NotificationsTab;
	onOpenChange: (open: boolean) => void;
}): JSX.Element {
	const inbox = useInbox(() => props.open);
	const unread = useUnreadBadge();
	const [tab, setTab] = createSignal<NotificationsTab>(
		untrack(() => props.tab)
	);
	const device = usePushDevice(() => props.open);

	// Each open decides the tab afresh: Inbox from the bell and the folded
	// topbar menu, Categories from the email footer's link.
	createEffect(() => {
		if (!props.open) return;
		setTab(props.tab);
	});

	function inboxLabel(): string {
		const badge = unread.badge();
		return badge === undefined ? "Inbox" : `Inbox (${badge})`;
	}

	return (
		<Drawer.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Drawer.Header>
				<Drawer.Title>Notifications</Drawer.Title>
				<Drawer.HeaderActions>
					<Show when={tab() === "inbox" && unread.count() > 0}>
						<Button
							variant="tertiary"
							onClick={() => {
								inbox.markAllRead();
							}}
						>
							Mark all read
						</Button>
					</Show>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>
			<Drawer.Body>
				<NotificationDeviceRow device={device} />
				<Tabs.Root
					value={tab()}
					onValueChange={(details) => {
						if (isNotificationsTab(details.value))
							setTab(details.value);
					}}
				>
					<Tabs.List>
						<Tabs.Trigger value="inbox">
							{inboxLabel()}
						</Tabs.Trigger>
						<Tabs.Trigger value="categories">
							Categories
						</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="inbox">
						<Show
							when={inbox.rows() !== undefined || inbox.failed()}
							fallback={
								<div
									class={styles.loading}
									role="status"
									aria-label="Loading"
								>
									<Skeleton width="long" />
									<Skeleton width="medium" />
									<Skeleton width="short" />
								</div>
							}
						>
							<NotificationList
								inbox={inbox}
								onClose={() => {
									props.onOpenChange(false);
								}}
							/>
						</Show>
					</Tabs.Content>
					<Tabs.Content value="categories">
						<NotificationCategories pushOn={device.pushOn()} />
					</Tabs.Content>
				</Tabs.Root>
			</Drawer.Body>
		</Drawer.Root>
	);
}
