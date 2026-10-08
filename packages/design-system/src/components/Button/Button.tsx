import clsx from "clsx";
import { children, createSignal, splitProps, type JSX } from "solid-js";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import iconStyles from "../Icon/Icon.module.scss";
import { Spinner } from "../Spinner/Spinner.tsx";

import { BaseButton, type BaseButtonProps } from "./BaseButton.tsx";
import styles from "./Button.module.scss";

/** True for a DOM element. A server render (prerender) has no DOM: its
 * children are strings, so nothing there is an element. */
function isElement(node: unknown): node is HTMLElement {
	return typeof HTMLElement !== "undefined" && node instanceof HTMLElement;
}

/** An Icon renders a `<span>` carrying the Icon CSS-module class. */
function isIconElement(node: unknown): node is HTMLElement {
	return isElement(node) && node.classList.contains(iconStyles.icon);
}

/**
 * An adornment is anything that flanks the label rather than being it — an Icon,
 * or a `Kbd` shortcut chip. Both need the same breathing room from the button's
 * edge, and asking specifically for an Icon meant a chip sat hard against it.
 */
function isAdornment(node: unknown): node is HTMLElement {
	return isIconElement(node) || (isElement(node) && node.tagName === "KBD");
}

export type ButtonProps = {
	/**
	 * `"pill"` is the marketing/landing-page treatment — a solid grey capsule
	 * matched to thejfloor.com's "Apply to join" link.
	 * It renders through the same prop surface as the other variants; pair it
	 * with `as="a"` + `href` to use it as a link, and pass a trailing
	 * `<Icon>arrow_outward</Icon>` child for the optional ↗ affix (the Button
	 * already treats a trailing Icon as a suffix). `"pill-light"` is the
	 * off-white sibling (thejfloor.com's "Contact" pill). Both read their font
	 * from `--button-pill-font`, falling back to the design-system sans.
	 */
	variant?: "primary" | "secondary" | "tertiary" | "pill" | "pill-light";
} & BaseButtonProps &
	WithPartClasses<"content" | "loadingSpinner">;

export function Button(props: ButtonProps): JSX.Element {
	const [local, rest] = splitProps(props, [
		"variant",
		"class",
		"isLoading",
		"children",
		"classOverride",
	]);

	const [clickHandlerExecuting, setClickHandlerExecuting] =
		createSignal(false);

	function loading(): boolean {
		return (local.isLoading ?? false) || clickHandlerExecuting();
	}

	const resolvedChildren = children(() => local.children);

	// Mirror embo: first child an Icon -> prefix; last of >1 children an Icon -> suffix.
	function hasPrefix(): boolean {
		const nodes = resolvedChildren.toArray();
		return nodes.length > 0 && isIconElement(nodes[0]);
	}

	function hasSuffix(): boolean {
		const nodes = resolvedChildren.toArray();
		return nodes.length > 1 && isAdornment(nodes[nodes.length - 1]);
	}

	return (
		<BaseButton
			{...rest}
			isLoading={local.isLoading}
			setIsLoading={setClickHandlerExecuting}
			class={clsx(
				styles.button,
				styles[local.variant ?? "primary"],
				local.class
			)}
			data-variant={local.variant ?? "primary"}
			data-loading={loading()}
			data-prefix={hasPrefix()}
			data-suffix={hasSuffix()}
		>
			<span
				class={clsx(
					styles.content,
					getPartStyles(styles, local, "content")
				)}
			>
				{resolvedChildren()}
			</span>
			{/* Always mounted (the loading state is a CSS transition), so hide it
			    from the accessibility tree while idle: otherwise the spinner's
			    "Loading" label leaks into the button's accessible name. */}
			<span
				class={clsx(
					styles.loadingSpinner,
					getPartStyles(styles, local, "loadingSpinner")
				)}
				aria-hidden={loading() ? undefined : true}
			>
				<Spinner />
			</span>
		</BaseButton>
	);
}
