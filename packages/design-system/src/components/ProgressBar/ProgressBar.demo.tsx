import { ProgressBar } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "ProgressBar",
	render: (p) => <ProgressBar value={p.value} max={p.max} label="Progress" />,
	controls: {
		value: { type: "number", default: 3 },
		max: { type: "number", default: 8 },
	},
	presets: {
		Done: { value: 8, max: 8 },
		"Nothing to do": { value: 0, max: 0 },
	},
} satisfies Demo;
