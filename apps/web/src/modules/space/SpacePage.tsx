import { SearchInput, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";

import { useAbility } from "../../lib/ability.tsx";
import { HouseRules } from "../../shared/rules/HouseRules.tsx";
import { RULES_SEARCH_LABEL } from "../../shared/rules/rulesContent.ts";

import { CountdownCard } from "./CountdownCard.tsx";
import { DiagnosticsTab } from "./DiagnosticsTab.tsx";
import { OccupancyCard } from "./OccupancyCard.tsx";
import styles from "./SpacePage.module.scss";
import { UnlockCard } from "./UnlockCard.tsx";
import { WifiCard } from "./WifiCard.tsx";

const INFO_TABS = [{ value: "rules", label: "Rules" }] as const;
const BOARD_ONLY_TABS = [
	{ value: "diagnostics", label: "Diagnostics" },
] as const;

/**
 * The Space page: a tabbed dashboard. Access = door/WiFi utilities plus (for
 * guests) the access countdown; Rules = the house rules as searchable cards;
 * Diagnostics (board only) = lock reachability and the door log. Staff see
 * the door only: no Rules tab, no WiFi, occupancy or countdown.
 *
 * Board-only triggers are rendered with `<For>` over a 0/1 list, not `<Show>`
 * / `<Can>` wrapping a `Tabs.Trigger` — that wrapper breaks Ark's sliding
 * indicator (see MemberCommunity).
 */
export function SpacePage() {
	const [params, setParams] = useSearchParams();
	const ability = useAbility();
	const [rulesQuery, setRulesQuery] = createSignal("");

	function isBoard(): boolean {
		return ability().can("manage", "Space");
	}
	function showsInfo(): boolean {
		return ability().can("view", "SpaceInfo");
	}
	function tabKeys(): readonly string[] {
		return [
			"access",
			...infoTabs().map((t) => t.value),
			...boardOnlyTabs().map((t) => t.value),
		];
	}
	function infoTabs(): readonly { value: string; label: string }[] {
		return showsInfo() ? INFO_TABS : [];
	}
	function boardOnlyTabs(): readonly { value: string; label: string }[] {
		return isBoard() ? BOARD_ONLY_TABS : [];
	}

	return (
		<Tabs.Root
			class={styles.console}
			urlParam={{
				get: () => params.tab,
				set: (v) => {
					setParams({ tab: v });
				},
				fallback: "access",
				keys: tabKeys(),
			}}
		>
			<div class={styles.tabBar}>
				<Tabs.List>
					<Tabs.Trigger value="access">Access</Tabs.Trigger>
					<For each={infoTabs()}>
						{(tab) => (
							<Tabs.Trigger value={tab.value}>
								{tab.label}
							</Tabs.Trigger>
						)}
					</For>
					<For each={boardOnlyTabs()}>
						{(tab) => (
							<Tabs.Trigger value={tab.value}>
								{tab.label}
							</Tabs.Trigger>
						)}
					</For>
				</Tabs.List>
				<For each={infoTabs()}>
					{(tab) => (
						<Tabs.Actions value={tab.value}>
							<SearchInput
								label=""
								aria-label={RULES_SEARCH_LABEL}
								placeholder={RULES_SEARCH_LABEL}
								class={styles.search}
								value={rulesQuery()}
								onValueChange={setRulesQuery}
							/>
						</Tabs.Actions>
					)}
				</For>
			</div>
			<Tabs.Content value="access">
				<div class={styles.grid}>
					<UnlockCard />
					<Show when={showsInfo()}>
						{/* Renders nothing for non-guests (no access window). */}
						<CountdownCard />
						<WifiCard />
						{/* Renders nothing while occupancy is disabled. */}
						<OccupancyCard />
					</Show>
				</div>
			</Tabs.Content>
			<For each={infoTabs()}>
				{(tab) => (
					<Tabs.Content value={tab.value}>
						<HouseRules query={rulesQuery()} />
					</Tabs.Content>
				)}
			</For>
			<For each={boardOnlyTabs()}>
				{(tab) => (
					<Tabs.Content value={tab.value} class={styles.panel}>
						{/* Mounted only while open: Ark keeps hidden panels
						    mounted, which left the door-health card showing
						    its page-load reading. */}
						<Show when={params.tab === tab.value}>
							<DiagnosticsTab />
						</Show>
					</Tabs.Content>
				)}
			</For>
		</Tabs.Root>
	);
}
