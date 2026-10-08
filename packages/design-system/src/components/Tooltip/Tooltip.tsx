import {
	Tooltip as ArkTooltip,
	type TooltipRootProps,
	type TooltipTriggerProps,
} from "@ark-ui/solid/tooltip";
import { type JSX, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";

import styles from "./Tooltip.module.scss";

export type TooltipProps = {
	/** The text/markup to display in the tooltip. Tooltip is disabled when empty. */
	tooltipContent: JSX.Element;
	/** The action to execute when the trigger is clicked. */
	onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
	/** `tabIndex` applied to the trigger. */
	triggerTabIndex?: number;
	/** IDs for ID composition with other components (e.g. Dialog). */
	ids?: TooltipRootProps["ids"];
	/** Trigger content. */
	children?: JSX.Element;
	/** Class applied to the trigger element. */
	class?: string;
	/**
	 * Render the trigger as the provided child element instead of the default
	 * `<button>` (ark/solid render-function form: `(props) => <El {...props()} />`).
	 * Used to avoid nested interactive elements when the trigger is already a
	 * button (e.g. IconButton composing BaseButton).
	 */
	asChild?: TooltipTriggerProps["asChild"];
	/** Ref forwarded to the content element. */
	ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
} & Omit<TooltipRootProps, "ids" | "children"> &
	WithPartClasses<"content" | "positioner">;

/**
 * Display informative text when users hover over or focus on an element.
 *
 * Ported from EmboUI's Tooltip. React→Solid: no `forwardRef` (`ref` is a plain
 * prop forwarded to `Content`); `Portal` comes from `solid-js/web`.
 */
export function Tooltip(props: TooltipProps): JSX.Element {
	const [, rootProps] = splitProps(props, [
		"tooltipContent",
		"onClick",
		"triggerTabIndex",
		"children",
		"class",
		"classOverride",
		"asChild",
		"ref",
	]);

	return (
		<ArkTooltip.Root
			{...rootProps}
			lazyMount={props.lazyMount ?? true}
			/**
			 * `fixed`, not floating-ui's default `absolute`.
			 *
			 * The positioner is portalled to `<body>`, so an absolute one is
			 * part of the DOCUMENT's scrollable overflow — and on the frame it
			 * first appears, floating-ui has not measured or flipped it yet, so
			 * it lands past the right edge of a phone-width viewport. That
			 * widened the page to 752px on a 448px screen, and Chrome for
			 * Android picks the page scale from the document width AT LOAD:
			 * deep-linking straight into the person drawer — whose autofocused
			 * header button opens its own tooltip — loaded the page zoomed out,
			 * with a layout viewport wide enough that no phone media query
			 * matched any more, so the drawer sat beside the table in the
			 * desktop layout. Opening that same drawer by navigating to it was
			 * fine: the scale was already settled.
			 *
			 * A fixed positioner is laid out against the viewport and adds
			 * nothing to the document's overflow, so the transient placement
			 * cannot move the page scale. Merged, not hardcoded, so a caller
			 * can still pass its own `positioning`.
			 */
			positioning={{ strategy: "fixed", ...props.positioning }}
			disabled={props.disabled ?? !props.tooltipContent}
			openDelay={250}
			closeDelay={0}
			ids={props.ids}
		>
			<ArkTooltip.Trigger
				class={
					props.class
						? `${styles.trigger} ${props.class}`
						: styles.trigger
				}
				onClick={props.onClick}
				tabIndex={props.triggerTabIndex}
				asChild={props.asChild}
			>
				{props.children}
			</ArkTooltip.Trigger>
			<Portal>
				<ArkTooltip.Positioner
					class={getPartStyles(styles, props, "positioner")}
				>
					<ArkTooltip.Content
						class={getPartStyles(styles, props, "content")}
						ref={props.ref}
					>
						{props.tooltipContent}
					</ArkTooltip.Content>
				</ArkTooltip.Positioner>
			</Portal>
		</ArkTooltip.Root>
	);
}
