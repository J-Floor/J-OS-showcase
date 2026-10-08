import { Icon, Logo } from "@j-os/design-system";
import { A } from "@solidjs/router";
import { For, createSignal } from "solid-js";

import { Can } from "../../../lib/ability.tsx";
import { modules } from "../../../modules/registry.ts";

import styles from "./Sidebar.module.scss";

export function Sidebar() {
	// Explicit hover state instead of CSS :hover/:focus-within — the latter stuck
	// the rail open after navigating (focus remains on the clicked link).
	const [expanded, setExpanded] = createSignal(false);
	// Each module renders only when the role can "view" its subject (declarative
	// CASL gate; board sees all, a member sees just the directory + Space).
	return (
		<nav
			class={styles.sidebar}
			classList={{ [styles.expanded]: expanded() }}
			onMouseEnter={() => setExpanded(true)}
			onMouseLeave={() => setExpanded(false)}
		>
			<A class={styles.brand} href="/" aria-label="J floor home">
				<Logo variant="monogram" class={styles.logo} />
			</A>
			<For each={modules}>
				{(module) => (
					<Can I="view" the={module.subject}>
						<A
							id={`nav-${module.id}`}
							class={styles.item}
							href={module.path}
						>
							<Icon class={styles.icon}>{module.icon}</Icon>
							<span class={styles.label}>{module.label}</span>
						</A>
					</Can>
				)}
			</For>
		</nav>
	);
}
