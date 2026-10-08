import { Avatar } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Avatar",
	render: (p) => <Avatar name={p.name} src={p.src || undefined} />,
	controls: {
		name: { type: "text", default: "Ada Lovelace" },
		src: { type: "text", default: "" },
	},
	presets: {
		Initials: { name: "Ada Lovelace", src: "" },
		SingleName: { name: "Prince", src: "" },
		Image: {
			name: "Ada Lovelace",
			src: "https://i.pravatar.cc/80",
		},
	},
} satisfies Demo;
