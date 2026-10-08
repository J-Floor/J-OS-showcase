import { Highlight } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Highlight",
	render: (p) => (
		<p>
			<Highlight
				text="Ada Lovelace wrote the first algorithm for the Analytical Engine"
				query={p.query as string}
			/>
		</p>
	),
	controls: {
		query: { type: "text", default: "a" },
	},
	presets: {
		// Lowercase against capitalised words — the case that highlights nothing
		// without `ignoreCase`.
		"Case-insensitive": { query: "ada" },
		"Several words": { query: "the" },
	},
} satisfies Demo;
