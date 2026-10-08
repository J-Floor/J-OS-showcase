import { Button, ExceptionDisplay } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "ExceptionDisplay",
	render: (p) => (
		<ExceptionDisplay
			status={
				p.status as "success" | "error" | "warning" | "info" | "neutral"
			}
			icon={p.icon}
			title={p.title}
			description={p.description}
		>
			{p.showAction ? <Button>Try again</Button> : undefined}
		</ExceptionDisplay>
	),
	controls: {
		status: {
			type: "select",
			options: ["success", "error", "warning", "info", "neutral"],
			default: "error",
		},
		icon: { type: "text", default: "error" },
		title: { type: "text", default: "Something went wrong" },
		description: {
			type: "text",
			default: "An unexpected error occurred. Please try again.",
		},
		showAction: { type: "boolean", default: true },
	},
	presets: {
		Warning: {
			status: "warning",
			icon: "warning",
			title: "Heads up",
			description: "This action cannot be undone.",
		},
		Info: {
			status: "info",
			icon: "info",
			title: "Good to know",
			description: "Changes sync automatically.",
			showAction: false,
		},
	},
} satisfies Demo;
