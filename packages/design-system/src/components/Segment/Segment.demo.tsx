import { createSignal } from "solid-js";

import { Segment } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Segment.demo.module.scss";

const STAGES = ["pending", "review", "approved", "archived"] as const;
type Stage = (typeof STAGES)[number];

export default {
	title: "Segment",
	render: (p) => {
		const [stage, setStage] = createSignal<Stage>("approved");
		const group = (
			<Segment.Root
				label={p.label}
				orientation={p.vertical ? "vertical" : "horizontal"}
				value={stage()}
				onValueChange={(d) => setStage(d.value as Stage)}
			>
				<Segment.Item value="pending">Pending</Segment.Item>
				<Segment.Item value="review">Review</Segment.Item>
				<Segment.Item value="approved">Approved</Segment.Item>
				<Segment.Item
					value="archived"
					disabled={p.archivedDisabled}
					disabledReason="Not offered here"
				>
					Archived
				</Segment.Item>
			</Segment.Root>
		);
		return p.narrow ? <div class={styles.narrow}>{group}</div> : group;
	},
	controls: {
		label: { type: "text", default: "Stage" },
		archivedDisabled: { type: "boolean", default: false },
		vertical: { type: "boolean", default: false },
		narrow: { type: "boolean", default: false },
	},
	presets: {
		// A stacked group in a narrow column — the shape a sheet uses, where a
		// row of options would not fit.
		"Stacked in a narrow column": { vertical: true, narrow: true },
	},
} satisfies Demo;
