import { Icon, Status, useStatusIcon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Status.demo.module.scss";

/** Reads the status CSS vars so the demo shows the bg/fg colour change. */
function StatusBody(props: { label: string }) {
	const icon = useStatusIcon();
	return (
		<span class={styles.pill}>
			<Icon>{icon()}</Icon>
			<span>{props.label}</span>
		</span>
	);
}

export default {
	title: "Status",
	render: (p) => (
		<Status status={p.status}>
			<StatusBody label={p.label} />
		</Status>
	),
	controls: {
		status: {
			type: "select",
			options: ["success", "error", "warning", "info", "neutral"],
			default: "neutral",
		},
		label: { type: "text", default: "Status label" },
	},
	presets: {
		Success: { status: "success", label: "Completed" },
		Error: { status: "error", label: "Failed" },
		Warning: { status: "warning", label: "Needs attention" },
		Info: { status: "info", label: "Heads up" },
		Neutral: { status: "neutral", label: "Idle" },
	},
} satisfies Demo;
