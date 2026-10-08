import { ShortcutPeekProvider, ThemeSwitch } from "@j-os/design-system";
import { HotkeysProvider } from "@tanstack/solid-hotkeys";
import type { ParentProps } from "solid-js";

import styles from "./app.module.scss";
import { Can } from "./lib/ability.tsx";
import { SignOutButton } from "./modules/auth/SignOutButton.tsx";
import { CommunityDataProvider } from "./modules/community/data/communityData.tsx";
import { DoorsIntro } from "./modules/onboarding/DoorsIntro.tsx";
import { WelcomeTour } from "./modules/onboarding/WelcomeTour.tsx";
import { WhatsNew } from "./modules/onboarding/WhatsNew.tsx";
import { LastPathTracker, ModuleRoutes, RoleGate } from "./routing/index.tsx";
import { AppErrorBoundary } from "./shared/AppErrorBoundary.tsx";
import { Breadcrumbs } from "./shared/components/Breadcrumbs/Breadcrumbs.tsx";
import { Sidebar } from "./shared/components/Sidebar/Sidebar.tsx";
import { ConfirmProvider } from "./shared/confirm.tsx";
import { BoardLevelProvider } from "./shared/data/boardLevel.tsx";
import { InstallPwaPrompt } from "./shared/InstallPwaPrompt.tsx";
import { NotificationsHost } from "./shared/notifications/NotificationsHost.tsx";
import { NotificationsPrompt } from "./shared/notifications/NotificationsPrompt.tsx";
import {
	NotificationsBell,
	TopbarMenu,
} from "./shared/notifications/TopbarMenu.tsx";
import { PromptStack } from "./shared/PromptStack.tsx";
import { GlobalSearch } from "./shared/search/GlobalSearch.tsx";
import { ShortcutPeekButton } from "./shared/ShortcutPeekButton.tsx";

/** Header + scroll region. Split out so the community-data provider can wrap
 *  the whole thing without duplicating this markup in both branches.
 *
 *  The app's one ConfirmProvider lives here, around the topbar AND the routed
 *  page, so sign-out in the header and every page's destructive actions share
 *  a single dialog. Pages do not mount their own: a provider scoped to a page
 *  left the header outside it, where `useConfirm` silently auto-confirms. The
 *  dialog portals to <body>, so wrapping `<main>` changes no layout. */
function ShellBody(props: ParentProps) {
	return (
		<ConfirmProvider>
			<main class={styles.main}>
				<header class={styles.topbar}>
					<AppErrorBoundary>
						<Breadcrumbs />
						<GlobalSearch />
						{/* Adding a topbar control changes the fold thresholds in
						    breakpoints.scss. */}
						<div class={styles.topbarActions}>
							{/* Each action its own control while the bar has
							    room; one kebab menu (TopbarMenu) once it does
							    not. Swapped in CSS by the bar's own width, see
							    app.module.scss. */}
							<div class={styles.desktopActions}>
								<ShortcutPeekButton />
								<Can I="view" the="Notifications">
									<NotificationsBell />
								</Can>
								<ThemeSwitch />
								<SignOutButton />
							</div>
							<div class={styles.foldedMenu}>
								<TopbarMenu />
							</div>
						</div>
					</AppErrorBoundary>
				</header>
				{/* The single scroll region: the shell, sidebar and header stay
				    fixed; only this scrolls. */}
				<div class={styles.content}>{props.children}</div>
				{/* Floated at this column's foot (above the phone bottom bar),
				    stacked top to bottom. */}
				<PromptStack>
					<Can I="view" the="Notifications">
						<NotificationsPrompt />
					</Can>
					<InstallPwaPrompt />
				</PromptStack>
				{/* Staff get no notifications: no drawer, and no push re-sync. */}
				<Can I="view" the="Notifications">
					<AppErrorBoundary>
						<NotificationsHost />
					</AppErrorBoundary>
				</Can>
			</main>
		</ConfirmProvider>
	);
}

function AdminShell(props: ParentProps) {
	return (
		<div class={styles.shell}>
			{/* First thing a person sees; the tour and What's New wait for it. */}
			<AppErrorBoundary>
				<DoorsIntro />
			</AppErrorBoundary>
			<AppErrorBoundary>
				<WelcomeTour />
			</AppErrorBoundary>
			<AppErrorBoundary>
				<WhatsNew />
			</AppErrorBoundary>
			<AppErrorBoundary>
				<Sidebar />
			</AppErrorBoundary>
			{/* Board: keep the three rosters subscribed at the (persistent)
			    shell level so navigating away and back doesn't re-suspend the
			    tables. The provider wraps the WHOLE shell, not just the routed
			    content, because global search sits in the header and searches
			    the same rosters — scoped any tighter, it would open a second
			    set of subscriptions for the same three queries. Non-board sees
			    the same layout without the board subscriptions. */}
			<Can
				I="view"
				the="Applications"
				fallback={<ShellBody>{props.children}</ShellBody>}
			>
				<CommunityDataProvider>
					<BoardLevelProvider>
						<ShellBody>{props.children}</ShellBody>
					</BoardLevelProvider>
				</CommunityDataProvider>
			</Can>
		</div>
	);
}

export function App(props: ParentProps) {
	return (
		<RoleGate>
			<LastPathTracker />
			{/* `ignoreInputs` set once, here, rather than repeated on every
			    bare-letter `createHotkey`/`createHotkeys` call across the app.
			    It must be off: the library's own typing guard blocks every
			    `<input>` including checkboxes, and a focused row checkbox is
			    exactly where someone presses a decision key — `isTypingTarget`
			    is the single gate meant to decide that, and it deliberately
			    carves checkboxes back out. */}
			<HotkeysProvider
				defaultOptions={{ hotkey: { ignoreInputs: false } }}
			>
				{/* Wraps the whole shell, not just the topbar: the peek state has
				    to reach the shortcut chips wherever in the app they render,
				    not only the button that latches it. */}
				<ShortcutPeekProvider>
					<AdminShell>{props.children}</AdminShell>
				</ShortcutPeekProvider>
			</HotkeysProvider>
		</RoleGate>
	);
}

export { ModuleRoutes };
