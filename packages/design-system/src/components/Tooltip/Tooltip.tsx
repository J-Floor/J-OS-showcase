import {
	Tooltip as ArkTooltip,
	type TooltipContentProps,
	type TooltipRootProps,
	type TooltipTriggerProps,
	useTooltipContext,
} from "@ark-ui/solid/tooltip";
import clsx from "clsx";
import { type JSX, onCleanup, onMount, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";

import { attachLongPress } from "./longPress.ts";
import styles from "./Tooltip.module.scss";

export const TOOLTIP_OPEN_DELAY_MS = 250;

export type TooltipProps = {
	/** The text/markup to display in the tooltip. Tooltip is disabled when empty. */
	tooltipContent: JSX.Element;
	/** The action to execute when the trigger is clicked. */
	onClick?: TooltipTriggerProps["onClick"];
	/** `tabIndex` applied to the trigger. */
	triggerTabIndex?: TooltipTriggerProps["tabIndex"];
	/** IDs for ID composition with other components (e.g. Dialog). */
	ids?: TooltipRootProps["ids"];
	/** Trigger content. */
	children?: JSX.Element;
	/** Class applied to the trigger element. */
	class?: TooltipTriggerProps["class"];
	/**
	 * Render the trigger as the provided child element instead of the default
	 * `<button>` (ark/solid render-function form: `(props) => <El {...props()} />`).
	 * Used to avoid nested interactive elements when the trigger is already a
	 * button (e.g. IconButton composing BaseButton).
	 */
	asChild?: TooltipTriggerProps["asChild"];
	/** Ref forwarded to the content element. */
	ref?: TooltipContentProps["ref"];
} & Omit<TooltipRootProps, "ids" | "children"> &
	WithPartClasses<"content" | "positioner">;

/** Wires the touch long-press onto the trigger zag put its id on. Renders nothing. */
function LongPress(props: { disabled: () => boolean }): JSX.Element {
	const tooltip = useTooltipContext();
	onMount(() => {
		const trigger = document.getElementById(
			tooltip().getTriggerProps().id ?? ""
		);
		if (!trigger) {
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console -- a warning for the developer, not the user
				console.warn(
					"Tooltip: trigger element not found, long press is off."
				);
			}
			return;
		}
		onCleanup(
			attachLongPress(trigger, {
				isDisabled: props.disabled,
				setOpen: (open) => {
					tooltip().setOpen(open);
				},
			})
		);
	});
	return null;
}

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
	/** No content, or switched off by the caller. */
	function isDisabled(): boolean {
		return props.disabled ?? !props.tooltipContent;
	}

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
			 * widens the page, and Chrome for Android picks the page scale
			 * from the document width AT LOAD: a deep link that autofocuses a
			 * tooltip trigger on load came up zoomed out, with a layout
			 * viewport too wide for any phone media query to match.
			 *
			 * A fixed positioner is laid out against the viewport and adds
			 * nothing to the document's overflow, so the transient placement
			 * cannot move the page scale. Merged, not hardcoded, so a caller
			 * can still pass its own `positioning`.
			 */
			positioning={{ strategy: "fixed", ...props.positioning }}
			disabled={isDisabled()}
			openDelay={TOOLTIP_OPEN_DELAY_MS}
			closeDelay={0}
			ids={props.ids}
		>
			<LongPress disabled={isDisabled} />
			<ArkTooltip.Trigger
				class={clsx(styles.trigger, props.class)}
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

/**
 * Props of {@link Tooltip.Anchor}: the tooltip's own props, minus what the
 * anchor owns (the trigger slot, its content) and `ref`, which on `Tooltip`
 * lands on the content and not on anything the caller renders.
 *
 * `triggerTabIndex` lands on the anchor span. A disabled child takes no focus;
 * pass `triggerTabIndex={0}`, or wrap the control in MakeDisablable for a
 * reason tooltip.
 */
export type TooltipAnchorProps = {
	/** The text/markup to display in the tooltip. Tooltip is disabled when empty. */
	label: TooltipProps["tooltipContent"];
	/** The element the tooltip points at. It keeps its own props and handlers. */
	children: JSX.Element;
} & Omit<
	TooltipProps,
	"tooltipContent" | "children" | "asChild" | "onClick" | "ref"
>;

/**
 * Point a tooltip at an element that is already something else's trigger (an
 * Ark trigger, a button with its own handlers).
 *
 * zag finds a trigger by id and an element carries one id, so the child cannot
 * also be the tooltip's trigger: a tight `<span>` wrapping it is (see the
 * ark-solid-composition skill). The span is no tab stop of its own: zag binds
 * the tooltip's focus/blur as bubbling focusin/focusout, so focusing the child
 * opens it. `class` lands on the span,
 * for a child that needs a box other than a shrink-wrapped inline one.
 */
function Anchor(props: TooltipAnchorProps): JSX.Element {
	const [local, tooltipProps] = splitProps(props, [
		"label",
		"children",
		"class",
	]);
	return (
		<Tooltip
			{...tooltipProps}
			tooltipContent={local.label}
			class={clsx(styles.anchor, local.class)}
			asChild={(anchorProps) => (
				<span {...anchorProps()}>{local.children}</span>
			)}
		/>
	);
}

Tooltip.Anchor = Anchor;
