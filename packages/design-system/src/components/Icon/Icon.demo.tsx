import { Icon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Icon.demo.module.scss";

// Mirrors EmboUI's Icon fixture: pick a text style and the glyph sizes from
// that ancestor's typography (its `[data-icon]` rule), never a size prop.
const SIZES: Record<string, string> = {
	h1: styles.h1,
	h2: styles.h2,
	h3: styles.h3,
	h4: styles.h4,
	h5: styles.h5,
	h6: styles.h6,
	"body-bold": styles.bodyBold,
	"body-medium": styles.bodyMedium,
	"body-regular": styles.bodyRegular,
	"body-small": styles.bodySmall,
	"body-tech": styles.bodyTech,
};

export default {
	title: "Icon",
	render: (p) => (
		<span class={`${styles.sample} ${SIZES[p.size]}`}>
			<Icon fill={p.fill}>{p.icon}</Icon>
			{p.showText ? "Sample text" : null}
		</span>
	),
	controls: {
		icon: { type: "text", default: "star" },
		fill: { type: "boolean", default: false },
		size: {
			type: "select",
			options: Object.keys(SIZES),
			default: "h2",
		},
		showText: { type: "boolean", default: true },
	},
	presets: {
		Filled: { fill: true },
		"Large (h1)": { size: "h1" },
		"Small (body-small)": { size: "body-small" },
	},
} satisfies Demo;
