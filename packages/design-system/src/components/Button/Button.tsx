import clsx from "clsx";
import { children, splitProps, type JSX } from "solid-js";

import { keyShortcutsOf } from "../../utils/activation.ts";
import { adornmentsOf } from "../../utils/adornments.ts";
import { separateDisablingProps } from "../../utils/disablingProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { callHandler, type TriggerProps } from "../../utils/triggerProps.ts";
import { type ShortcutHint } from "../../utils/types.ts";
import { Spinner } from "../Spinner/Spinner.tsx";

import {
	BaseButton,
	type BaseButtonProps,
	disablingWith,
} from "./BaseButton.tsx";
import styles from "./Button.module.scss";

type ButtonClickEvent = Parameters<NonNullable<BaseButtonProps["onClick"]>>[0];

export type ButtonProps = {
	/**
	 * `"pill"` is a solid capsule for marketing pages, `"pill-light"` its
	 * light sibling. Pair either with `as="a"` + `href` to use it as a link,
	 * and pass a trailing `<Icon>` for an affix (a trailing Icon is a suffix).
	 * Both read their font from `--button-pill-font`, falling back to the
	 * design-system sans.
	 */
	variant?: "primary" | "secondary" | "tertiary" | "pill" | "pill-light";
	/**
	 * Trigger props from an outer Ark `asChild` (a Dialog, Menu or Tour
	 * trigger). Pass the bag here rather than spreading it: its attributes
	 * land on the button, and its `onClick` runs before the Button's own,
	 * behind the same loading guard.
	 */
	triggerProps?: TriggerProps;
	/**
	 * The key that fires this button, named in `aria-keyshortcuts` (a bare
	 * modifier names none). That is how a shortcut press finds the button
	 * it fires, so an overlay it opens grows out of it. Attribute only: to
	 * show the key, pass a `<Kbd>` child.
	 */
	shortcut?: ShortcutHint;
} & BaseButtonProps &
	WithPartClasses<"content" | "loadingSpinner">;

export function Button(props: ButtonProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [local, rest] = splitProps(others, [
		"variant",
		"class",
		"children",
		"classOverride",
		"triggerProps",
		"onClick",
		"shortcut",
	]);

	const resolvedChildren = children(() => local.children);
	function adornments(): ReturnType<typeof adornmentsOf> {
		return adornmentsOf(resolvedChildren.toArray());
	}

	function handleClick(event: ButtonClickEvent) {
		callHandler(local.triggerProps?.onClick, event);
		return local.onClick?.(event);
	}

	return (
		<BaseButton
			{...local.triggerProps}
			{...rest}
			{...disablingWith(
				disabling,
				Boolean(disabling.disabled) ||
					Boolean(local.triggerProps?.disabled)
			)}
			onClick={handleClick}
			aria-keyshortcuts={keyShortcutsOf(local.shortcut)}
			class={clsx(
				styles.button,
				styles[local.variant ?? "primary"],
				local.class
			)}
			data-variant={local.variant ?? "primary"}
			data-prefix={adornments().hasPrefix}
			data-suffix={adornments().hasSuffix}
		>
			<span class={getPartStyles(styles, local, "content")}>
				{resolvedChildren()}
			</span>
			{/* Always mounted (the loading state is a CSS transition) and always
			    hidden: `aria-busy` on the button carries the state, and the
			    spinner's "Loading" label must not join the button's name. */}
			<span
				class={getPartStyles(styles, local, "loadingSpinner")}
				aria-hidden="true"
			>
				<Spinner />
			</span>
		</BaseButton>
	);
}
