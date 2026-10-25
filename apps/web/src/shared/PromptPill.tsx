import { FloatingToolbar, IconButton } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { ICONS } from "./icons.ts";

/** The pill a one-time prompt floats in. */
function Root(props: { children: JSX.Element }): JSX.Element {
	return <FloatingToolbar>{props.children}</FloatingToolbar>;
}

/** The pill's ✕. What it does (remember, hide) is up to the prompt. */
function Dismiss(props: { onClick: () => void }): JSX.Element {
	return (
		<IconButton tooltipLabel="Dismiss" onClick={props.onClick}>
			{ICONS.close}
		</IconButton>
	);
}

/** The shell of the floating prompts (install, notifications): a pill with
 *  the prompt's own content, then a dismiss button. */
export const PromptPill = { Root, Dismiss };
