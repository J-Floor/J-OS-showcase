import { createSignal } from "solid-js";

import { Segment } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Segment.demo.module.scss";

const ROLES = ["board", "admin", "member", "guest"] as const;
type Role = (typeof ROLES)[number];

export default {
	title: "Segment",
	render: (p) => {
		const [role, setRole] = createSignal<Role>("member");
		const group = (
			<Segment.Root
				orientation={p.vertical ? "vertical" : "horizontal"}
				value={role()}
				onValueChange={(d) => setRole(d.value as Role)}
			>
				<Segment.Item value="board">Board</Segment.Item>
				<Segment.Item value="admin">Admin</Segment.Item>
				<Segment.Item value="member">Member</Segment.Item>
				<Segment.Item value="guest">Guest</Segment.Item>
			</Segment.Root>
		);
		return p.narrow ? <div class={styles.narrow}>{group}</div> : group;
	},
	controls: {
		vertical: { type: "boolean", default: false },
		narrow: { type: "boolean", default: false },
	},
	presets: {
		// A stacked group in a narrow column — the shape the community drawer uses,
		// where a row of options would not fit.
		"Stacked in a narrow column": { vertical: true, narrow: true },
	},
} satisfies Demo;
