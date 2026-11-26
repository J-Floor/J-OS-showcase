import { Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { Show, type JSX } from "solid-js";

import styles from "./AnalyticsPage.module.scss";
import { AppViewsTab } from "./app/AppViewsTab.tsx";
import { WebsiteTab } from "./website/WebsiteTab.tsx";

const TAB_KEYS = ["app", "website"] as const;

/** The board's analytics: how the app is used (App) and the public site's
 *  traffic (Website). */
export function AnalyticsPage(): JSX.Element {
	const [params, setParams] = useSearchParams();
	// Ark keeps hidden panels mounted; the Website tab polls and refreshes, so
	// each panel mounts only while its tab is the selected one.
	function selected(): "app" | "website" {
		return params.tab === "website" ? "website" : "app";
	}
	return (
		<Tabs.Root
			class={styles.page}
			urlParam={{
				get: () => params.tab,
				set: (value: string) => {
					setParams({ tab: value });
				},
				fallback: "app",
				keys: TAB_KEYS,
			}}
		>
			<Tabs.Bar>
				<Tabs.List>
					<Tabs.Trigger value="app">App</Tabs.Trigger>
					<Tabs.Trigger value="website">Website</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Bar>
			<Tabs.Content class={styles.panel} value="app">
				<Show when={selected() === "app"}>
					<AppViewsTab />
				</Show>
			</Tabs.Content>
			<Tabs.Content class={styles.panel} value="website">
				<Show when={selected() === "website"}>
					<WebsiteTab />
				</Show>
			</Tabs.Content>
		</Tabs.Root>
	);
}
