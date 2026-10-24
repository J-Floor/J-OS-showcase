import type { Demo } from "../../../demo/types.ts";

import { Morph } from "./Morph.tsx";

export default {
	title: "Morph",
	render: (p) => <Morph of="demo">{p.label}</Morph>,
	controls: {
		label: { type: "text", default: "Kanban card" },
	},
} satisfies Demo;
