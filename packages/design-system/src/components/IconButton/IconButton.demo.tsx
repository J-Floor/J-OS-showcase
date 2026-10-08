import { Show } from "solid-js";

import { IconButton, type IconButtonProps, Menu } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "IconButton",
	render: (p) => (
		<Show
			when={p.asMenuTrigger}
			fallback={
				<IconButton
					tooltipLabel={p.tooltipLabel}
					disabled={p.disabled}
					disabledReason={p.disabledReason || undefined}
					isLoading={p.isLoading}
					badge={p.badge || undefined}
					badgeLabel={p.badgeLabel || undefined}
				>
					{p.icon}
				</IconButton>
			}
		>
			<Menu.Root>
				<Menu.Trigger
					asChild={(triggerProps) => (
						<IconButton
							tooltipLabel={p.tooltipLabel}
							disabled={p.disabled}
							disabledReason={p.disabledReason || undefined}
							isLoading={p.isLoading}
							badge={p.badge || undefined}
							badgeLabel={p.badgeLabel || undefined}
							triggerProps={
								triggerProps() as IconButtonProps["triggerProps"]
							}
						>
							{p.icon}
						</IconButton>
					)}
				/>
				<Menu.Content>
					<Menu.Item value="edit">Edit</Menu.Item>
					<Menu.Item value="delete">Delete</Menu.Item>
				</Menu.Content>
			</Menu.Root>
		</Show>
	),
	controls: {
		icon: {
			type: "select",
			options: [
				"add",
				"check",
				"delete",
				"home",
				"star",
				"settings",
				"more_vert",
				"notifications",
			],
			default: "add",
		},
		tooltipLabel: { type: "text", default: "Add item" },
		disabled: { type: "boolean", default: false },
		disabledReason: { type: "text", default: "Not available right now" },
		isLoading: { type: "boolean", default: false },
		asMenuTrigger: { type: "boolean", default: false },
		badge: { type: "text", default: "" },
		badgeLabel: { type: "text", default: "" },
	},
	presets: {
		Delete: { icon: "delete", tooltipLabel: "Delete" },
		Loading: { isLoading: true },
		Disabled: { disabled: true, disabledReason: "Not available right now" },
		"With badge": {
			icon: "notifications",
			tooltipLabel: "Notifications",
			badge: "3",
			badgeLabel: "3 unread",
		},
		"Menu trigger": {
			icon: "more_vert",
			tooltipLabel: "More",
			asMenuTrigger: true,
		},
	},
} satisfies Demo;
