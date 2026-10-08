import clsx from "clsx";
import { children, splitProps, type JSX } from "solid-js";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import iconStyles from "../Icon/Icon.module.scss";
import iconButtonStyles from "../IconButton/IconButton.module.scss";

import styles from "./Chip.module.scss";

/** Whether the node, or anything inside it, carries `cls`. A composed control
 * (IconButton is a Tooltip-wrapped button) may render the class-bearing element
 * a level down from the node the children walk resolves, so the subtree is
 * checked too rather than only the node itself. */
function carriesClass(node: unknown, cls: string): node is HTMLElement {
	return (
		node instanceof HTMLElement &&
		(node.classList.contains(cls) || node.querySelector(`.${cls}`) !== null)
	);
}

/** An Icon renders a `<span>` carrying the Icon CSS-module class. */
function isIconElement(node: unknown): node is HTMLElement {
	return carriesClass(node, iconStyles.icon);
}

/** An IconButton renders a `<button>` carrying the IconButton CSS-module class. */
function isIconButtonElement(node: unknown): node is HTMLElement {
	return carriesClass(node, iconButtonStyles.iconButton);
}

// A child counts as a prefix/suffix affix when it is an Icon or IconButton.
function isAffixElement(node: unknown): node is HTMLElement {
	return isIconElement(node) || isIconButtonElement(node);
}

export type ChipProps = {
	/**
	 * The Chip content: a label, optionally with a leading and/or trailing
	 * `Icon` or `IconButton` child (like Button). A first child renders as a
	 * prefix, a last child as a suffix. Use a trailing `IconButton` for an
	 * action such as dismissing the Chip.
	 */
	children: JSX.Element;
	class?: string;
} & WithPartClasses<"root"> &
	Omit<JSX.HTMLAttributes<HTMLSpanElement>, "class" | "children">;

/**
 * Compact pill for a label, optionally flanked by a leading/trailing Icon or
 * IconButton (e.g. a removable filter chip).
 *
 * Solid port of EmboUI's Chip: React.Children.toArray + `child.type === Icon`
 * has no Solid equivalent, so affix detection instead resolves the children to
 * real DOM nodes (via `children()`) and checks each one's CSS-module class,
 * mirroring the idiom `Button.tsx` uses for its own leading/trailing Icon.
 */
export function Chip(props: ChipProps): JSX.Element {
	const [local, rest] = splitProps(props, [
		"class",
		"children",
		"classOverride",
	]);

	const resolvedChildren = children(() => local.children);

	function hasPrefix(): boolean {
		const nodes = resolvedChildren.toArray();
		return nodes.length > 0 && isAffixElement(nodes[0]);
	}

	function hasSuffix(): boolean {
		const nodes = resolvedChildren.toArray();
		return nodes.length > 1 && isAffixElement(nodes[nodes.length - 1]);
	}

	return (
		<span
			{...rest}
			class={clsx(
				styles.chip,
				local.class,
				getPartStyles(styles, local, "root")
			)}
			data-prefix={hasPrefix()}
			data-suffix={hasSuffix()}
		>
			{resolvedChildren()}
		</span>
	);
}
