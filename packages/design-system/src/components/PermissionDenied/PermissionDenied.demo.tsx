import { Button, Icon, PermissionDenied } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "PermissionDenied",
	render: (p) => (
		<PermissionDenied title={p.title} description={p.description}>
			{p.showAction ? (
				<Button>
					<Icon>login</Icon>Sign in
				</Button>
			) : undefined}
		</PermissionDenied>
	),
	controls: {
		title: { type: "text", default: "You don't have access" },
		description: {
			type: "text",
			default: "You don't have permission to view this.",
		},
		showAction: { type: "boolean", default: true },
	},
	presets: {
		"No access yet": {
			title: "No access yet",
			description: "Sign in to continue.",
		},
	},
} satisfies Demo;
