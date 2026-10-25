import { Button, Dialog, Input } from "@j-os/design-system";
import { createSignal } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "Dialog",
	render: (p) => {
		const [open, setOpen] = createSignal(false);
		return (
			<Dialog.Root
				open={open()}
				onOpenChange={setOpen}
				morphId={p.morph ? undefined : false}
			>
				<Dialog.Trigger
					asChild={(triggerProps) => (
						<Button triggerProps={triggerProps()}>
							Open dialog
						</Button>
					)}
				/>
				{/* Its content is built for each opening and kept while it
				    morphs closed: type in the field, close, reopen, and it is
				    empty again. */}
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>{p.title}</Dialog.Title>
						<Dialog.Description>{p.description}</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						<Input label="Type the project name to confirm" />
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Cancel />
						<Dialog.CloseTrigger
							asChild={(closeProps) => (
								<Button triggerProps={closeProps()}>
									Confirm
								</Button>
							)}
						/>
					</Dialog.Footer>
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
