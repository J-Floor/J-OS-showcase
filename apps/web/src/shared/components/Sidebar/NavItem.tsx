import { Icon, createHoverIntent } from "@j-os/design-system";
import { A } from "@solidjs/router";

import { prefetchModule } from "../../../modules/prefetchModule.ts";
import type { ModuleManifest } from "../../../modules/types.ts";

import styles from "./Sidebar.module.scss";

/** One page's link: the rail, the phone bar and its more sheet all render
 *  this, so the three never drift apart. The sheet draws the bar's pages
 *  again, without the id the bar's links carry. */
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
