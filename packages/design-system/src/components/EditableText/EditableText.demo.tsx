import { EditableText } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "EditableText",
	render: (p) => (
		<EditableText
			value="Edit me"
			placeholder={p.placeholder}
			multiline={p.multiline}
			maxLength={p.maxLength}
			onCommit={() => {}}
		/>
	),
	controls: {
		placeholder: { type: "text", default: "Type something" },
		multiline: { type: "boolean", default: false },
		maxLength: { type: "number", default: 20 },
	},
	presets: {
		Multiline: { multiline: true },
	},
} satisfies Demo;
