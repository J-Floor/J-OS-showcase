import { Button, FloatingToolbar, Icon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "FloatingToolbar",
	render: () => (
		<FloatingToolbar>
			<Button variant="secondary">Export</Button>
			<Button>
				<Icon>add</Icon> New event
			</Button>
		</FloatingToolbar>
	),
	controls: {},
	presets: {},
} satisfies Demo;
