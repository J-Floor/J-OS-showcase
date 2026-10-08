import { Logo } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Logo",
	// inline style: continuous numeric font-size slider + arbitrary user-entered colour, no sensible class breakpoints
	render: (p) => (
		<span style={{ "font-size": `${p.size}px`, color: p.color }}>
			<Logo
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
	},
} satisfies Demo;
