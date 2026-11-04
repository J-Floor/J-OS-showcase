import { Icon, createHoverIntent, morphPart } from "@j-os/design-system";
import { A } from "@solidjs/router";

import type { ModuleManifest } from "../../shared/moduleManifest.ts";
import { prefetchModule } from "../prefetchModule.ts";

import styles from "./Sidebar.module.scss";

/** One page's link: the rail, the phone bar and its more sheet all render
 *  this, so the three never drift apart. The sheet draws the bar's pages
 *  again, without the id the bar's links carry. Each link is keyed by its
 *  page, so as the bar grows into the more sheet its links stay in place:
 *  they fly into the sheet's copies of them. */
export function NavItem(props: {
	module: ModuleManifest;
	onPick?: () => void;
	hasId?: boolean;
}) {
	const hoverIntent = createHoverIntent(() => {
		prefetchModule(props.module);
	});
	return (
		<A
			id={props.hasId === false ? undefined : `nav-${props.module.id}`}
			class={styles.item}
			href={props.module.path}
			{...morphPart({
				key: `nav-${props.module.id}`,
				label: props.module.label,
			})}
			onPointerEnter={hoverIntent.onPointerEnter}
			onPointerLeave={hoverIntent.onPointerLeave}
			onFocus={() => {
				prefetchModule(props.module);
			}}
			onClick={() => props.onPick?.()}
		>
			<Icon class={styles.icon}>{props.module.icon}</Icon>
			<span class={styles.label}>{props.module.label}</span>
		</A>
	);
}
