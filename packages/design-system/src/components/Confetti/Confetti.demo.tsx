import { Button, Confetti } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Confetti",
	render: (p) => (
		<Confetti>
			<Button>{p.label}</Button>
		</Confetti>
	),
	controls: {
		label: { type: "text", default: "Celebrate" },
	},
} satisfies Demo;
