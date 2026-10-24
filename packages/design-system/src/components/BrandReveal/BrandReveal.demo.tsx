import type { Demo } from "../../../demo/types.ts";
import { Logo } from "../Logo/Logo.tsx";

import { BRAND_SCREEN, BrandReveal } from "./BrandReveal.tsx";

export default {
	title: "BrandReveal",
	render: (p) => (
		<BrandReveal
			ready={Boolean(p.ready)}
			splash={<Logo animated variant="logo" />}
		>
			<div {...{ [BRAND_SCREEN]: "" }}>{p.content}</div>
		</BrandReveal>
	),
	controls: {
		ready: { type: "boolean", default: false },
		content: { type: "text", default: "The page behind the splash" },
	},
} satisfies Demo;
