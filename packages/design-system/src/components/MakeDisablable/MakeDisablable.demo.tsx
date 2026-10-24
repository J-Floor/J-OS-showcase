import { MakeDisablable } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "MakeDisablable",
	render: (p) => (
		<MakeDisablable
			disabled={p.disabled}
			disabledReason={p.withReason ? p.disabledReason : undefined}
			shamefullyOmitDisabledReason={!p.withReason}
		>
			<button type="button" disabled={p.disabled}>
				A plain control
			</button>
		</MakeDisablable>
	),
	controls: {
		disabled: { type: "boolean", default: true },
		withReason: { type: "boolean", default: true },
		disabledReason: { type: "text", default: "Sign in to change this." },
	},
	presets: {
		"Reason tooltip": { disabled: true, withReason: true },
		"Dim only": { disabled: true, withReason: false },
		Enabled: { disabled: false },
	},
} satisfies Demo;
