import { Button, Dialog } from "@j-os/design-system";
import { createSignal } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Dialog.demo.module.scss";

export default {
	title: "Dialog",
	render: (p) => {
		const [open, setOpen] = createSignal(false);
		return (
			<Dialog.Root
				open={open()}
				onOpenChange={(details) => {
					setOpen(details.open);
				}}
				morph={p.morph ? undefined : false}
			>
				<Dialog.Trigger
					asChild={(triggerProps) => (
						<Button triggerProps={triggerProps()}>
							Open dialog
						</Button>
					)}
				/>
				<Dialog.Content>
					<Dialog.Title>{p.title}</Dialog.Title>
					<Dialog.Description>{p.description}</Dialog.Description>
					<div class={styles.footer}>
						<Dialog.CloseTrigger
							asChild={(closeProps) => (
								<Button
									triggerProps={closeProps()}
									variant="tertiary"
								>
									Cancel
								</Button>
							)}
						/>
						<Dialog.CloseTrigger
							asChild={(closeProps) => (
								<Button triggerProps={closeProps()}>
									Confirm
								</Button>
							)}
						/>
					</div>
				</Dialog.Content>
			</Dialog.Root>
		);
	},
	controls: {
		morph: { type: "boolean", default: true },
		title: { type: "text", default: "Delete project?" },
		description: {
			type: "text",
			default:
				"This permanently removes the project and all its data. This cannot be undone.",
		},
	},
} satisfies Demo;
