import { Button, Icon } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function isPill(variant: string): boolean {
	return variant === "pill" || variant === "pill-light";
}

export default {
	title: "Button",
	render: (p) => (
		<Button
			variant={p.variant}
			disabled={p.disabled}
			disabledReason={p.disabledReason}
			isLoading={p.isLoading}
			as={isPill(p.variant) ? "a" : undefined}
			href={
				isPill(p.variant)
					? "https://app.thejfloor.com/sign-up"
					: undefined
			}
		>
			{p.label}
			{p.showArrow ? <Icon>arrow_outward</Icon> : null}
		</Button>
	),
	controls: {
		label: { type: "text", default: "Click me" },
		variant: {
			type: "select",
			options: ["primary", "secondary", "tertiary", "pill", "pill-light"],
			default: "primary",
		},
		disabled: { type: "boolean", default: false },
		disabledReason: { type: "text", default: "Not available right now" },
		isLoading: { type: "boolean", default: false },
		showArrow: { type: "boolean", default: false },
	},
	presets: {
		Secondary: { variant: "secondary" },
		Tertiary: { variant: "tertiary" },
		Pill: { variant: "pill", label: "Apply to join", showArrow: true },
		"Pill light": { variant: "pill-light", label: "Contact" },
		Loading: { isLoading: true },
		Disabled: { disabled: true, disabledReason: "Not available right now" },
	},
} satisfies Demo;
