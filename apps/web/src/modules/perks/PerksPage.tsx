import { Button, Icon, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createMemo, Show, type JSX } from "solid-js";

import { Can } from "../../lib/ability.tsx";
import { ICONS } from "../../shared/icons.ts";
import { tabKeyOf } from "../../shared/tabKey.ts";

import { PerksList } from "./PerksList.tsx";
import styles from "./PerksPage.module.scss";
import { RequestsTab } from "./requests/RequestsTab.tsx";

const TAB_KEYS = ["perks", "requests"] as const;

type PerksTabKey = (typeof TAB_KEYS)[number];

/** The board's page: the perks, and every request for them, on
 *  `?tab=perks|requests`. The tabs are the list shell: the root is the
 *  console, and each panel is the bounded box its table fills. */
function BoardPerks(): JSX.Element {
	const [params, setParams] = useSearchParams();

	/** The tab on screen: `Tabs.Root` falls back for an unknown value without
	 *  rewriting the URL, so `?tab=bogus` shows Perks while the param still
	 *  says `bogus`. */
	function activeTab(): PerksTabKey {
		return tabKeyOf(TAB_KEYS, params.tab, "perks");
	}

	/** Whether the Requests tab has been on screen. It turns true the first
	 *  time it is, and stays true: the tab mounts then and stays mounted, so
	 *  a visit that never opens it never subscribes to every request. */
	const wasVisited = createMemo<boolean>(
		(seen) => seen || activeTab() === "requests",
		false
	);

	// The Perks tab's list owns the selection the create sheet opens in, and
	// hands over its opener as it mounts.
	let openCreate: (() => void) | undefined;

	return (
		// No `lazyMount`: the Perks panel stays mounted behind the Requests
		// tab, so a `?perk=` link that lands there still reaches PerksList,
		// whose `onNeedTab` switches back to open it.
		<Tabs.Root
			class={styles.console}
			urlParam={{
				get: () => params.tab,
				set: (value) => {
					// Only a tab picked by hand (zag emits `onValueChange` from its
					// own events, never from a controlled change). It abandons the
					// perk the Perks tab had open: left in the URL it would reopen
					// on refresh, or pull the board back through `onNeedTab` below.
					setParams({ tab: value, perk: undefined });
				},
				fallback: "perks",
				keys: TAB_KEYS,
			}}
		>
			<Tabs.Bar>
				<Tabs.List>
					<Tabs.Trigger value="perks">Perks</Tabs.Trigger>
					<Tabs.Trigger value="requests">Requests</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Bar>
			<Can I="create" the="Perks">
				{/* In the tab bar, not a toolbar of its own: the Perks panel
				    stays mounted behind the Requests tab, and on a phone a
				    toolbar of its own would float over that tab. */}
				<Tabs.Actions value="perks">
					<Button
						onClick={() => {
							openCreate?.();
						}}
					>
						<Icon>{ICONS.add}</Icon> New perk
					</Button>
				</Tabs.Actions>
			</Can>
			<Tabs.Content value="perks" class={styles.panel}>
				<PerksList
					openCreateRef={(open) => {
						openCreate = open;
					}}
					active={() => activeTab() === "perks"}
					onNeedTab={() => {
						// Keep `perk`: it is the id this switch exists to open.
						setParams({ tab: "perks" }, { replace: true });
					}}
				/>
			</Tabs.Content>
			<Tabs.Content value="requests" class={styles.panel}>
				<Show when={wasVisited()}>
					<RequestsTab />
				</Show>
			</Tabs.Content>
		</Tabs.Root>
	);
}

/** Everyone else's page: the perks alone, in the same list shell, written
 *  out here since there are no tabs to carry it. */
function MemberPerks(): JSX.Element {
	return (
		<div class={styles.console}>
			<div class={styles.panel}>
				<PerksList />
			</div>
		</div>
	);
}

/** Perks: every community tier browses them and requests one; board/admin
 *  also track the requests, on a second tab. The page owns the list shell,
 *  as Inventory and Community do; the lists inside it bring none. */
export function PerksPage(): JSX.Element {
	return (
		<Can I="manage" the="Perks" fallback={<MemberPerks />}>
			<BoardPerks />
		</Can>
	);
}
