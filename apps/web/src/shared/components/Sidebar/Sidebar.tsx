import {
	Icon,
	Logo,
	activeTransition,
	createHoverIntent,
} from "@j-os/design-system";
import { A } from "@solidjs/router";
import { For, createSignal } from "solid-js";

import { Can } from "../../../lib/ability.tsx";
import { prefetchModule } from "../../../modules/prefetchModule.ts";
import { modules } from "../../../modules/registry.ts";

import { BRAND_FRAME } from "./brandLanding.ts";
import styles from "./Sidebar.module.scss";

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
	// Each module renders only when the role can "view" its subject (declarative
	// CASL gate; board sees all, a member sees just the directory + Space).
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
			<For each={modules}>
				{(module) => {
					const hoverIntent = createHoverIntent(() => {
						prefetchModule(module);
					});
					return (
						<Can I="view" the={module.subject}>
							<A
								id={`nav-${module.id}`}
								class={styles.item}
								href={module.path}
								onPointerEnter={hoverIntent.onPointerEnter}
								onPointerLeave={hoverIntent.onPointerLeave}
								onFocus={() => {
									prefetchModule(module);
								}}
							>
								<Icon class={styles.icon}>{module.icon}</Icon>
								<span class={styles.label}>{module.label}</span>
							</A>
						</Can>
					);
				}}
			</For>
		</nav>
	);
}
