import { Badge } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Badge",
	render: (p) => <Badge status={p.status}>{p.label}</Badge>,
	controls: {
		status: {
			type: "select",
			options: ["success", "error", "warning", "info", "neutral"],
			default: "neutral",
		},
		label: { type: "text", default: "Outstanding" },
	},
	presets: {
		Compliant: { status: "success", label: "Agreement signed" },
		Outstanding: { status: "error", label: "Agreement outstanding" },
		Onboarding: { status: "warning", label: "Onboarding" },
		PendingReview: { status: "info", label: "Pending review" },
		Expired: { status: "neutral", label: "Expired" },
	},
} satisfies Demo;
