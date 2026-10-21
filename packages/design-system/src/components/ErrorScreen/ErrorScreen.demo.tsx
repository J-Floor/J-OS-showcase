import { ErrorScreen } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "ErrorScreen",
	render: (p) => (
		<ErrorScreen
			message={p.message}
			onRetry={() => {
				// eslint-disable-next-line no-console -- the demo shows the callback firing
				console.info("onRetry");
			}}
		/>
	),
	controls: {
		message: {
			type: "text",
			default:
				"This page didn't load. Check your connection and try again.",
		},
	},
	presets: {
		"Render error": { message: "Demo error: the component exploded." },
	},
} satisfies Demo;
