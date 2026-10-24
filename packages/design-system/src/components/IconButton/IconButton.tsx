import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";

import { separateDisablingProps } from "../../utils/disablingProps.ts";
import { useShortcutPeek } from "../../utils/shortcutPeek.tsx";
import { callHandler, type TriggerProps } from "../../utils/triggerProps.ts";
import { type ShortcutHint } from "../../utils/types.ts";
import { Badge } from "../Badge/Badge.tsx";
import {
	BaseButton,
	type BaseButtonProps,
	disablingWith,
	useButtonLoading,
} from "../Button/BaseButton.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import { Tooltip, type TooltipProps } from "../Tooltip/Tooltip.tsx";

import styles from "./IconButton.module.scss";

/** What Tooltip's `asChild` hands its trigger. */
type TooltipTriggerAccessor = Parameters<
	NonNullable<TooltipProps["asChild"]>
>[0];

export type IconButtonProps = {
	/** Accessible label shown in the tooltip (and the button's accessible name). */
	tooltipLabel: string;
	/**
	 * The key that fires this button, shown as a chip in its tooltip.
	 *
	 * A prop rather than markup in `tooltipLabel`, so the label stays a plain
	 * string and goes on being the button's accessible name — glyphs in an
	 * accessible name read as noise. It also keeps the display rules (chip in
	 * the tooltip always, never on a touch screen — see Kbd.module.scss) in one
	 * place instead of at every call site.
	 *
	 * A lone `Modifier` (e.g. `Alt`) is allowed for a button whose hint IS the
	 * modifier — the peek toggle, which the Alt key doubles for. Display only; a
	 * bare modifier does not register a binding.
	 */
	shortcut?: ShortcutHint;
	/** Material Symbols ligature name (e.g. "add", "delete"). */
	children: string;
	/**
	 * External trigger props from an *outer* `asChild` (e.g. an ark Menu trigger
	 * or NumberInput increment/decrement trigger). They go on the `<button>`
	 * alone; the tooltip then anchors to a tight wrapping `<span>`, so each zag
	 * machine finds its own trigger by its own id. When these carry `disabled`
	 * (ark's min/max bound), the BaseButton dims via MakeDisablable, same as any
	 * disabled button.
	 */
	triggerProps?: TriggerProps;
	/**
	 * Short text pinned to the button's top-trailing corner (an unread count,
	 * say), drawn as an info {@link Badge}. Hidden from assistive tech: say
	 * what it means with {@link IconButtonProps.badgeLabel}.
	 */
	badge?: string;
	/**
	 * Appended to the accessible name (`Notifications, 3 unread`) while a
	 * {@link IconButtonProps.badge} shows. A prop, so the component never
	 * invents copy of its own.
	 */
	badgeLabel?: string;
} & BaseButtonProps;

/** The glyph (or, while the button loads, a spinner), the peek-shortcut chip
 *  and the corner badge. */
function ButtonContent(props: {
	icon: IconButtonProps["children"];
	peekedShortcut: IconButtonProps["shortcut"];
	badge: IconButtonProps["badge"];
}): JSX.Element {
	const isLoading = useButtonLoading();
	return (
		<>
			<Show when={isLoading()} fallback={<Icon>{props.icon}</Icon>}>
				<Spinner />
			</Show>
			<Show when={props.peekedShortcut} keyed>
				{(shortcut) => (
					<Kbd shortcut={shortcut} class={styles.peekBadge} />
				)}
			</Show>
			<Show when={props.badge}>
				{(text) => (
					<span class={styles.badge} aria-hidden="true" data-badge="">
						<Badge status="info" class={styles.badgePill}>
							{text()}
						</Badge>
					</span>
				)}
			</Show>
		</>
	);
}

/** The tooltip text, with the shortcut's chip beside it when there is one. */
function TooltipLabel(props: {
	label: IconButtonProps["tooltipLabel"];
	shortcut: IconButtonProps["shortcut"];
}): JSX.Element {
	return (
		<Show when={props.shortcut} fallback={props.label} keyed>
			{(shortcut) => (
				<>
					{props.label} <Kbd shortcut={shortcut} />
				</>
			)}
		</Show>
	);
}

/** The button's accessible name: the caller's own `aria-label` when given,
 *  none when the caller names it with `aria-labelledby`, else the label plus
 *  the badge's meaning while a badge shows. */
function accessibleName(
	local: Pick<
		IconButtonProps,
		| "tooltipLabel"
		| "badge"
		| "badgeLabel"
		| "aria-label"
		| "aria-labelledby"
	>
): string | undefined {
	if (local["aria-label"] !== undefined) return local["aria-label"];
	if (local["aria-labelledby"] !== undefined) return undefined;
	return local.badge && local.badgeLabel
		? `${local.tooltipLabel}, ${local.badgeLabel}`
		: local.tooltipLabel;
}

/** A button slotted into the tooltip's trigger: straight onto the button, or,
 *  when an outer machine owns the button, onto a wrapping span. */
function renderTooltipTrigger(
	tooltipProps: TooltipTriggerAccessor,
	external: TriggerProps | undefined,
	button: (
		triggerProps?: TriggerProps,
		describedBy?: () => string | undefined
	) => JSX.Element
): JSX.Element {
	if (!external) {
		return button(tooltipProps());
	}
	// The span never takes focus, but zag's Solid normalizer binds
	// the tooltip's focus/blur as bubbling focusin/focusout, so the
	// button's focus still reaches it. The description belongs on the
	// focused element, so hand it down to the button.
	const inner = button(external, () => tooltipProps()["aria-describedby"]);
	return (
		<span {...tooltipProps()} class={styles.tooltipTrigger}>
			{inner}
		</span>
	);
}

/** The bag's own click (an outer machine's toggle, the tooltip's close),
 *  then the caller's, whose promise keeps the button loading. */
function bothClicks(
	bagClick: TriggerProps["onClick"],
	ownClick: BaseButtonProps["onClick"]
): BaseButtonProps["onClick"] {
	return (event) => {
		callHandler(bagClick, event);
		return ownClick?.(event);
	};
}

/** The caller's descriptions and the open tooltip's, as one id list. */
function describedByIds(...ids: (string | undefined)[]): string | undefined {
	const joined = ids.filter(Boolean).join(" ");
	return joined === "" ? undefined : joined;
}

/**
 * A round, icon-only button with a tooltip label.
 *
 * Ported from EmboUI's IconButton. `children` is a Material Symbols ligature;
 * a {@link Spinner} replaces the {@link Icon} while loading, from `isLoading`
 * or from an async `onClick` still pending.
 *
 * Composition (React→Solid a11y): the {@link BaseButton} IS the tooltip trigger
 * (via `Tooltip`'s `asChild` render prop) to avoid a `<button><button>` nesting.
 * It can additionally be slotted INTO an outer `asChild` (ark trigger) via
 * {@link IconButtonProps.triggerProps}. zag finds every trigger by id and an
 * element has one id, so the two machines can't share the button: the button
 * is the outer machine's trigger and the tooltip's trigger is a `<span>`
 * wrapping it (see the ark-solid-composition skill).
 */
export function IconButton(props: IconButtonProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [local, rest] = splitProps(others, [
		"tooltipLabel",
		"shortcut",
		"children",
		"class",
		"isLoading",
		"onClick",
		"triggerProps",
		"badge",
		"badgeLabel",
		"aria-label",
		"aria-describedby",
	]);

	const peek = useShortcutPeek();

	// Which shortcut, if any, to reveal right now as an anchored corner badge.
	//
	// While peeking (Alt held, or a peek toggle latched) each shortcut button
	// shows its key as a small chip pinned to its own corner — NOT by force-opening
	// its tooltip. Tooltips portal to `<body>` and position by floating-ui, so
	// forcing dozens open at once stacked them above everything (an open overlay
	// included) and they collided. A badge lives inside its own button's box, so a
	// chip in a list stays in the list and one in an overlay stays there, with
	// no portal, no z-index war and nothing to overlap. Bare (loading/disabled)
	// buttons show none: a chip for a key that will not fire only misleads.
	function peekShortcut(): ShortcutHint | undefined {
		return peek.peeking() && !bare() ? local.shortcut : undefined;
	}

	function isDisabled(): boolean {
		return (
			Boolean(disabling.disabled) || Boolean(local.triggerProps?.disabled)
		);
	}

	// The button carries ONE trigger's props: the external ones when given (so
	// an outer ark machine stays registered even when no tooltip is shown), else
	// the tooltip's.
	function button(
		triggerProps?: TriggerProps,
		describedBy?: () => string | undefined
	): JSX.Element {
		return (
			<BaseButton
				{...rest}
				{...triggerProps}
				// A disabled native button fires no hover, so the label stands
				// in as the disabled reason (MakeDisablable shows it).
				{...disablingWith(disabling, isDisabled(), local.tooltipLabel)}
				aria-describedby={describedByIds(
					local["aria-describedby"],
					describedBy
						? describedBy()
						: triggerProps?.["aria-describedby"]
				)}
				isLoading={local.isLoading}
				class={clsx(styles.iconButton, local.class)}
				aria-label={accessibleName({
					...local,
					"aria-labelledby": props["aria-labelledby"],
				})}
				onClick={bothClicks(triggerProps?.onClick, local.onClick)}
			>
				<ButtonContent
					icon={local.children}
					peekedShortcut={peekShortcut()}
					badge={local.badge}
				/>
			</BaseButton>
		);
	}

	// Drop the label tooltip while loading, while this button is disabled, or
	// while the external (ark) trigger is disabled — the bare BaseButton still
	// dims + reason-tooltips via MakeDisablable. An async click keeps the
	// tooltip: its pending state lives in this BaseButton, and swapping the
	// tooltip out would remount a fresh one mid-click.
	function bare(): boolean {
		return Boolean(local.isLoading) || isDisabled();
	}

	return (
		<Show when={!bare()} fallback={button(local.triggerProps)}>
			<Tooltip
				tooltipContent={
					<TooltipLabel
						label={local.tooltipLabel}
						shortcut={local.shortcut}
					/>
				}
				asChild={(tooltipProps) =>
					renderTooltipTrigger(
						tooltipProps,
						local.triggerProps,
						button
					)
				}
			/>
		</Show>
	);
}
