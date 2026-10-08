import { Kbd } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Kbd.demo.module.scss";

export default {
	title: "Kbd",
	render: () => (
		<span class={styles.row}>
			<Kbd shortcut="Mod+K" />
			<Kbd shortcut="Mod+Shift+P" />
			<Kbd shortcut="Escape" />
			<Kbd shortcut="Enter" />
			<Kbd shortcut="ArrowUp" />
			<Kbd shortcut="Enter">to open</Kbd>
		</span>
	),
	controls: {},
	presets: {},
} satisfies Demo;
