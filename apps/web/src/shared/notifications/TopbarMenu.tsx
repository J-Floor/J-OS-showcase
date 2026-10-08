import {
	Badge,
	Icon,
	IconButton,
	type IconButtonProps,
	Menu,
	useTheme,
} from "@j-os/design-system";
import { type JSX, Show } from "solid-js";

import { Can, useAbility } from "../../lib/ability.tsx";
import { useConfirmedSignOut } from "../../modules/auth/SignOutButton.tsx";
import { ICONS } from "../icons.ts";

import { openNotifications } from "./notificationsState.ts";
import { useUnreadBadge } from "./unread.ts";

type TopbarActions = {
	openNotifications: () => void;
	toggleTheme: () => void;
	signOut: () => Promise<void>;
};

export function runTopbarAction(value: string, actions: TopbarActions): void {
	if (value === "notifications") actions.openNotifications();
	else if (value === "theme") actions.toggleTheme();
	else if (value === "signout") void actions.signOut();
}

/** The desktop topbar's bell, with the unread count in its corner. */
export function NotificationsBell(): JSX.Element {
	const unread = useUnreadBadge();
	return (
		<IconButton
			tooltipLabel="Notifications"
			badge={unread.badge()}
			badgeLabel={unread.label()}
			onClick={() => {
				openNotifications();
			}}
		>
			{ICONS.notifications}
		</IconButton>
	);
}

/**
 * The folded topbar's one menu: Notifications (not for staff), Theme, Sign out
 * (which asks first, like the icon). A roomy bar shows the same actions as
 * separate controls; app.module.scss swaps the two by the bar's own width
 * (a container query), not the viewport's. The trigger and the Notifications
 * item carry the unread count the bell shows.
 *
 * The trigger hands its props to IconButton through `triggerProps`: the
 * `<button>` becomes the menu's trigger and IconButton anchors its tooltip to
 * a wrapper, so each machine finds its own trigger by id (see the
 * ark-solid-composition skill). Spreading them instead lets the tooltip's id
 * win and anchors the menu to the page corner.
 */
export function TopbarMenu(): JSX.Element {
	const { theme, toggle } = useTheme();
	const signOut = useConfirmedSignOut();
	const ability = useAbility();
	const unread = useUnreadBadge(() => ability().can("view", "Notifications"));
	return (
		<Menu.Root
			onSelect={(details) => {
				runTopbarAction(details.value, {
					openNotifications,
					toggleTheme: toggle,
					signOut,
				});
			}}
		>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						badge={unread.badge()}
						badgeLabel={unread.label()}
						triggerProps={
							triggerProps() as IconButtonProps["triggerProps"]
						}
					>
						{ICONS.more}
					</IconButton>
				)}
			/>
			<Menu.Content>
				<Can I="view" the="Notifications">
					<Menu.Item value="notifications">
						<Icon>{ICONS.notifications}</Icon>Notifications
						<Show when={unread.badge()}>
							{(text) => <Badge status="info">{text()}</Badge>}
						</Show>
					</Menu.Item>
				</Can>
				<Menu.Item value="theme">
					<Icon>
						{theme() === "dark" ? ICONS.lightMode : ICONS.darkMode}
					</Icon>
					{theme() === "dark" ? "Light theme" : "Dark theme"}
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="signout">
					<Icon>{ICONS.signOut}</Icon>Sign out
				</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	);
}
