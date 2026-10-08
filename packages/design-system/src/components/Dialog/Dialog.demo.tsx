import { Button, Dialog } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Dialog.demo.module.scss";

export default {
	title: "Dialog",
	render: (p) => (
		<Dialog.Root>
			<Dialog.Trigger
				asChild={(triggerProps) => (
					<Button {...(triggerProps() as object)}>Open dialog</Button>
				)}
			/>
			<Dialog.Content>
				<Dialog.Title>{p.title}</Dialog.Title>
				<Dialog.Description>{p.description}</Dialog.Description>
				<div class={styles.footer}>
					<Dialog.CloseTrigger
						asChild={(closeProps) => (
							<Button
								{...(closeProps() as object)}
								variant="tertiary"
							>
								Cancel
							</Button>
						)}
					/>
					<Dialog.CloseTrigger
						asChild={(closeProps) => (
							<Button {...(closeProps() as object)}>
								Confirm
							</Button>
						)}
					/>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	),
	controls: {
		title: { type: "text", default: "Delete project?" },
		description: {
			type: "text",
			default:
				"This permanently removes the project and all its data. This cannot be undone.",
		},
	},
} satisfies Demo;
