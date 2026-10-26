import {
	Logo,
	PHONE_QUERY,
	activeTransition,
	createMediaQuery,
} from "@j-os/design-system";
import { A } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { useAbility } from "../../../lib/ability.tsx";
import { modules } from "../../../modules/registry.ts";

import { BRAND_FRAME } from "./brandLanding.ts";
import { createPhoneMore } from "./createPhoneMore.ts";
import { NavItem } from "./NavItem.tsx";
import { splitPhoneBar } from "./phoneBar.ts";
import { MoreButton, MoreSheet } from "./PhoneMore.tsx";
import styles from "./Sidebar.module.scss";

/**
 * A phone shows the first four viewable pages and a more item that opens the
 * rest in a bottom sheet; the CSS hides the more item on the desktop rail,
 * where every page shows as before.
 */
export function Sidebar() {
	// Explicit hover state instead of CSS :hover/:focus-within — the latter stuck
	// the rail open after navigating (focus remains on the clicked link).
	// A page change sends a mouseleave/mouseenter pair while the browser
	// suppresses rendering for the transition's update, and the 200 ms width
	// transition shows it as a dip. So a mouseleave during a transition is
	// held, and the rail re-reads the pointer once the transition is over.
	const [expanded, setExpanded] = createSignal(false);
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={rail}` binding below, which the rule can't see
	let rail: HTMLElement | undefined;
	function onMouseLeave(): void {
		const running = activeTransition();
		if (!running) {
			setExpanded(false);
			return;
		}
		void running.then(() => {
			setExpanded(rail?.matches(":hover") ?? false);
		});
	}
	// Only the pages the role can "view" (declarative CASL gate; board sees
	// all, a member sees just the directory + Space), listed so the phone bar
	// can count them.
	const ability = useAbility();
	const split = createMemo(() =>
		splitPhoneBar(
			modules.filter((module) => ability().can("view", module.subject))
		)
	);
	function hasOverflow(): boolean {
		return split().overflow.length > 0;
	}
	const more = createPhoneMore();
	// A sheet left open when the window grows into the rail has no more item
	// to close it.
	const isPhone = createMediaQuery(PHONE_QUERY);
	createEffect(() => {
		if (!isPhone()) more.close();
	});
	return (
		<nav
			ref={rail}
			{...{ [BRAND_FRAME]: "" }}
			class={styles.sidebar}
			classList={{ [styles.expanded]: expanded() }}
			onMouseEnter={() => setExpanded(true)}
			onMouseLeave={onMouseLeave}
		>
			<A class={styles.brand} href="/" aria-label="J floor home">
				<Logo variant="monogram" class={styles.logo} />
			</A>
			<div class={styles.row} data-testid="phone-bar-row">
				<For each={split().bar}>
					{(module) => <NavItem module={module} />}
				</For>
				<Show when={hasOverflow()}>
					<MoreButton more={more} overflow={split().overflow} />
				</Show>
			</div>
			<Show when={hasOverflow()}>
				<MoreSheet
					more={more}
					bar={split().bar}
					overflow={split().overflow}
					barElement={() => rail}
				/>
			</Show>
		</nav>
	);
}
