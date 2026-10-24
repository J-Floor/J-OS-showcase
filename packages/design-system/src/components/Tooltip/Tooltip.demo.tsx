import { Button, Tooltip } from "@j-os/design-system";
import { createSignal } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Tooltip",
	render: (p) => {
		const [clicks, setClicks] = createSignal(0);
		return (
			<>
				<Tooltip
					tooltipContent={p.tooltipContent}
					disabled={p.disabled}
				>
					<Button variant="secondary">{p.label}</Button>
				</Tooltip>
				<Tooltip.Anchor label={p.tooltipContent} disabled={p.disabled}>
					<Button
						variant="secondary"
						onClick={() => {
							setClicks((count) => count + 1);
						}}
					>
						Anchored: clicked {clicks()} times
					</Button>
				</Tooltip.Anchor>
				<p>
					<code>Tooltip.Anchor</code> points a tooltip at an element
					that keeps its own handlers, such as another component's
					trigger.
				</p>
				<p>
					On touch screens, press and hold the trigger to show its
					tooltip. Releasing hides it again, and the hold does not
					click.
				</p>
			</>
		);
	},
	controls: {
		label: { type: "text", default: "Hover me" },
		tooltipContent: { type: "text", default: "Helpful hint" },
		disabled: { type: "boolean", default: false },
	},
	presets: { Disabled: { disabled: true } },
} satisfies Demo;
