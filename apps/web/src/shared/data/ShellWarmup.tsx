import {
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	type JSX,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import { useAbility } from "../../lib/ability.tsx";
import { preloadView } from "../../modules/prefetchModule.ts";
import { modules } from "../../modules/registry.ts";

import { isKeeperActive, prefetch } from "./queryKeeper.ts";
import { useQuery } from "./useQuery.ts";
import { whenIdle } from "./whenIdle.ts";

const WIFI_KEY = "wifi";

/**
 * Mounted once in the shell, renders nothing. Holds `getCurrentPerson` for the
 * whole session (Convex shares one subscription per query and args, so every
 * other reader gets it on its first fetch), and once the browser is idle warms
 * what the Space access tab reads and the page chunks the person may open.
 * The role can resolve after idle, so the warm-up follows the ability and
 * warms each thing once. The Wi-Fi gate is the Space page's own for
 * `WifiCard` (`view SpaceInfo`), which matches the server's community tiers.
 */
export function ShellWarmup(): JSX.Element {
	useQuery(api.people.getCurrentPerson, {});
	const ability = useAbility();
	const [idle, setIdle] = createSignal(false);
	const warmed = new Set<string>();

	function once(key: string, warm: () => void): void {
		if (warmed.has(key)) return;
		warmed.add(key);
		warm();
	}

	onMount(() => {
		onCleanup(whenIdle(() => setIdle(true)));
	});

	createEffect(() => {
		if (!idle()) return;
		const current = ability();
		// A prefetch while the keeper is off holds nothing, so it waits for
		// the session rather than counting as done.
		if (isKeeperActive() && current.can("view", "SpaceInfo")) {
			once(WIFI_KEY, () => {
				prefetch(api.wifi.get, {});
			});
		}
		for (const entry of modules) {
			if (current.can("view", entry.subject)) {
				once(entry.id, () => {
					preloadView(entry);
				});
			}
		}
	});
	return null;
}
