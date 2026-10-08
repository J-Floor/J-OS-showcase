import { Spinner } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Spinner",
	render: (p) => <Spinner size={p.size} />,
	controls: {
		size: { type: "text", default: "2rem" },
	},
	presets: {
		Large: { size: "4rem" },
	},
} satisfies Demo;
