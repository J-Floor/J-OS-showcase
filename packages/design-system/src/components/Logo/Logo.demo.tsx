import { Logo } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Logo.demo.module.scss";

export default {
	title: "Logo",
	render: (p) => (
		<span style={{ "--demo-size": `${p.size}px`, "--demo-color": p.color }}>
			<Logo
				class={styles.logo}
				variant={p.variant}
				animated={p.animated}
				title={p.labelled ? "J floor" : undefined}
			/>
		</span>
	),
	controls: {
		variant: {
			type: "select",
			options: ["logo", "monogram"],
			default: "logo",
		},
		size: { type: "number", default: 64 },
		color: { type: "text", default: "var(--jf-fg-strong)" },
		labelled: { type: "boolean", default: true },
		// One-shot reveal on mount; re-select the Logo demo to replay it.
		animated: { type: "boolean", default: false },
	},
	presets: {
		Monogram: { variant: "monogram", size: 48 },
		"Muted logo": { color: "var(--jf-fg-muted)" },
		"Animated reveal": { animated: true, size: 96 },
		// The full logo is two stacked parts (frame + J, `data-logo-part`);
		// at splash size any seam or offset between them would show.
		"Splash size": { animated: true, size: 88, labelled: false },
	},
} satisfies Demo;
