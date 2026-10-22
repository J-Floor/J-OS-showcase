import type { Demo } from "../../../demo/types.ts";

import { Morph, type EntityId } from "./Morph.tsx";

export default {
	title: "Morph",
	render: (p) => <Morph of={"demo" as EntityId}>{p.label}</Morph>,
	controls: {
		label: { type: "text", default: "Kanban card" },
	},
} satisfies Demo;
