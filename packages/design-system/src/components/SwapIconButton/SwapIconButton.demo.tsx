import { createSignal } from "solid-js";

import { SwapIconButton } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function SwapIconButtonDemo(props: {
	tooltipLabel: string;
	idleIcon: string;
	successIcon: string;
}) {
	const [success, setSuccess] = createSignal(false);
	function handleClick() {
		setSuccess(true);
		setTimeout(() => {
			setSuccess(false);
		}, 1500);
	}
	return (
		<SwapIconButton
			tooltipLabel={props.tooltipLabel}
			idleIcon={props.idleIcon}
			successIcon={props.successIcon}
			success={success()}
			onClick={handleClick}
		/>
	);
}

export default {
	title: "SwapIconButton",
	render: (p) => (
		<SwapIconButtonDemo
			tooltipLabel={p.tooltipLabel}
			idleIcon={p.idleIcon}
			successIcon={p.successIcon}
		/>
	),
	controls: {
		tooltipLabel: { type: "text", default: "Copy" },
		idleIcon: { type: "text", default: "content_copy" },
		successIcon: { type: "text", default: "check" },
	},
	presets: {
		Save: { tooltipLabel: "Save", idleIcon: "save", successIcon: "check" },
	},
} satisfies Demo;
