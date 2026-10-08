import type { Hotkey, Modifier } from "@tanstack/solid-hotkeys";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";

import { type TriggerProps } from "../../utils/triggerProps.ts";
import { Badge } from "../Badge/Badge.tsx";
import { BaseButton, type BaseButtonProps } from "../Button/BaseButton.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";
import { useShortcutPeek } from "../ShortcutPeek/ShortcutPeek.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./IconButton.module.scss";

/** The tooltip trigger prop the wrapping `<span>` hands down to the button. */
type TooltipTriggerProps = { "aria-describedby"?: string };

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
	shortcut?: Hotkey | Modifier;
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

/**
 * A round, icon-only button with a tooltip label.
 *
 * Ported from EmboUI's IconButton. `children` is a Material Symbols ligature;
 * a {@link Spinner} replaces the {@link Icon} while loading.
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
	// Keep `disabled` (and the disabling group) in `rest` so the strict
	// PropsWithDisabling union reaches BaseButton intact; read props.disabled
	// directly for the loading/tooltip gate.
	const [local, rest] = splitProps(props, [
		"tooltipLabel",
		"shortcut",
		"children",
		"class",
		"isLoading",
		"onClick",
		"triggerProps",
		"badge",
		"badgeLabel",
	]);

	const peek = useShortcutPeek();

	// Which shortcut, if any, to reveal right now as an anchored corner badge.
	//
	// While peeking (Alt held, or the topbar toggle latched) each shortcut button
	// shows its key as a small chip pinned to its own corner — NOT by force-opening
	// its tooltip. Tooltips portal to `<body>` and position by floating-ui, so
	// forcing dozens open at once stacked them above everything (the open drawer
	// included) and they collided. A badge lives inside its own button's box, so a
	// roster chip stays in the roster and a drawer chip stays in the drawer, with
	// no portal, no z-index war and nothing to overlap. Bare (loading/disabled)
	// buttons show none: a chip for a key that will not fire only misleads.
	function peekShortcut(): Hotkey | Modifier | undefined {
		return peek.peeking() && !bare() ? local.shortcut : undefined;
	}

	function accessibleName(): string {
		return local.badge && local.badgeLabel
			? `${local.tooltipLabel}, ${local.badgeLabel}`
			: local.tooltipLabel;
	}

	function content(): JSX.Element {
		return (
			<>
				<Show
					when={local.isLoading}
					fallback={<Icon>{local.children}</Icon>}
				>
					<Spinner />
				</Show>
				<Show when={peekShortcut()} keyed>
					{(shortcut) => (
						<Kbd shortcut={shortcut} class={styles.peekBadge} />
					)}
				</Show>
				<Show when={local.badge}>
					{(text) => (
						<span
							class={styles.badge}
							aria-hidden="true"
							data-badge=""
						>
							<Badge status="info" class={styles.badgePill}>
								{text()}
							</Badge>
						</span>
					)}
				</Show>
			</>
		);
	}

	// The button carries ONE trigger's props: the external ones when given (so
	// an outer ark machine stays registered even when no tooltip is shown), else
	// the tooltip's.
	function button(triggerProps?: TriggerProps, extra?: object): JSX.Element {
		// Spread as a plain `object` (as the original tooltip-only path did): the
		// bag carries ark `data-*`/handlers that
		// don't line up with BaseButton's prop types, but are runtime-safe. Typing
		// it as `object` adds them without tripping the strict PropsWithDisabling
		// union (which a structural cast flattens and breaks).
		//
		// Disabled tooltip: a disabled native button doesn't fire hover, so when
		// the button is bare-disabled the label tooltip is gone. Fall back to the
		// label as the disabled REASON — MakeDisablable's span trigger surfaces it
		// on hover even while disabled. An explicit `disabledReason` still wins.
		// Only a disabled button needs the label fallback: BaseButton already keeps
		// an enabled one free of a disabled reason. Spread untyped: a typed
		// `disabledReason` prop trips the strict PropsWithDisabling union when
		// `rest` already carries the disabling shape.
		const isDisabled =
			Boolean(props.disabled) || Boolean(local.triggerProps?.disabled);
		const reasonProps = isDisabled
			? ({
					disabledReason: props.disabledReason ?? local.tooltipLabel,
				} as object)
			: {};
		return (
			<BaseButton
				{...rest}
				{...(triggerProps as object)}
				{...extra}
				{...reasonProps}
				isLoading={local.isLoading}
				class={clsx(styles.iconButton, local.class)}
				aria-label={accessibleName()}
				onClick={local.onClick}
			>
				{content()}
			</BaseButton>
		);
	}

	// Drop the label tooltip while loading, while this button is disabled, or
	// while the external (ark) trigger is disabled — the bare BaseButton still
	// dims + reason-tooltips via MakeDisablable.
	function bare(): boolean {
		return (
			Boolean(local.isLoading) ||
			Boolean(props.disabled) ||
			Boolean(local.triggerProps?.disabled)
		);
	}

	return (
		<Show when={!bare()} fallback={button(local.triggerProps)}>
			<Tooltip
				tooltipContent={
					<Show
						when={local.shortcut}
						fallback={local.tooltipLabel}
						keyed
					>
						{(shortcut) => (
							<>
								{local.tooltipLabel} <Kbd shortcut={shortcut} />
							</>
						)}
					</Show>
				}
				asChild={(tooltipProps) => {
					const external = local.triggerProps;
					if (!external) {
						return button(tooltipProps() as TriggerProps);
					}
					// The span never takes focus, but zag's Solid normalizer binds
					// the tooltip's focus/blur as bubbling focusin/focusout, so the
					// button's focus still reaches it. The description belongs on the
					// focused element, so hand it down to the button.
					function tip(): TooltipTriggerProps {
						return tooltipProps() as TooltipTriggerProps;
					}
					const inner = button(external, {
						get "aria-describedby"() {
							return tip()["aria-describedby"];
						},
					});
					return (
						<span
							{...(tooltipProps() as object)}
							class={styles.tooltipTrigger}
						>
							{inner}
						</span>
					);
				}}
			/>
		</Show>
	);
}
