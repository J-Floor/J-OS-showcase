import { Button, Tour, useTour, type TourStep } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";
import styles from "./Tour.demo.module.scss";

// A start button plus two tooltip targets, so the tour walks dialog -> tooltip
// -> tooltip -> dialog. Lives in its own component so `useTour` has an owner.
function TourDemo() {
	const steps: TourStep[] = [
		{
			id: "welcome",
			type: "dialog",
			title: "Welcome",
			description: "A quick tour of these two actions.",
			actions: [{ label: "Start", action: "next" }],
		},
		{
			id: "save",
			type: "tooltip",
			title: "Save",
			description: "Save your work here.",
			target: () =>
				document.querySelector<HTMLElement>("#tour-demo-save"),
			actions: [
				{ label: "Back", action: "prev" },
				{ label: "Next", action: "next" },
			],
		},
		{
			id: "share",
			type: "tooltip",
			title: "Share",
			description: "Share it with your team.",
			target: () =>
				document.querySelector<HTMLElement>("#tour-demo-share"),
			actions: [
				{ label: "Back", action: "prev" },
				{ label: "Next", action: "next" },
			],
		},
		{
			id: "done",
			type: "dialog",
			title: "All set",
			description: "That's the whole tour.",
			actions: [{ label: "Finish", action: "dismiss" }],
		},
	];
	const tour = useTour({ steps });
	return (
		<div class={styles.row}>
			<Button onClick={() => tour().start()}>Start tour</Button>
			<Button id="tour-demo-save" variant="secondary">
				Save
			</Button>
			<Button id="tour-demo-share" variant="secondary">
				Share
			</Button>
			<Tour tour={tour} />
		</div>
	);
}

export default {
	title: "Tour",
	render: () => <TourDemo />,
	controls: {},
} satisfies Demo;
