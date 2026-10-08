import type { JSX } from "solid-js";

/** Props handed back by an ark / Tooltip `asChild` render-prop for one trigger. */
export type TriggerProps = JSX.HTMLAttributes<HTMLButtonElement> & {
	ref?: (el: HTMLButtonElement) => void;
	class?: string;
	disabled?: boolean;
};
