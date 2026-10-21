import { Button, createToaster, Toast } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const toaster = createToaster();

export default {
	title: "Toast",
	render: (p) => (
		<>
			<Button
				onClick={() => {
					toaster.create({ type: "error", title: p.title });
				}}
			>
				Error toast
			</Button>
			<Button
				variant="secondary"
				onClick={() => {
					toaster.create({ type: "success", title: p.title });
				}}
			>
				Success toast
			</Button>
			<Button
				variant="tertiary"
				onClick={() => {
					toaster.create({
						type: "info",
						title: p.title,
						description: p.description,
					});
				}}
			>
				Info toast
			</Button>
			<Toast toaster={toaster} />
		</>
	),
	controls: {
		title: { type: "text", default: "Could not save the note." },
		description: { type: "text", default: "Check your connection." },
	},
} satisfies Demo;
