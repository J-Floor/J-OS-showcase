import clsx from "clsx";
import { children, splitProps, type JSX } from "solid-js";

import { adornmentsOf } from "../../utils/adornments.ts";

import styles from "./Chip.module.scss";

export type ChipProps = {
	/**
	 * The Chip content: a label, optionally with a leading and/or trailing
	 * `Icon` or `IconButton` child (like Button). A first child renders as a
	 * prefix, a last child as a suffix. Use a trailing `IconButton` for an
	 * action such as dismissing the Chip.
	 */
	children: JSX.Element;
} & Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children">;

/**
 * Compact pill for a label, optionally flanked by a leading/trailing Icon or
 * IconButton (e.g. a removable filter chip).
 *
 * Solid port of EmboUI's Chip: React.Children.toArray + `child.type === Icon`
 * has no Solid equivalent, so the children are resolved to DOM nodes and
 * {@link adornmentsOf} checks their ends, the same detector Button uses.
 */
export function Chip(props: ChipProps): JSX.Element {
	const [local, rest] = splitProps(props, ["class", "children"]);

	const resolvedChildren = children(() => local.children);

	function adornments(): ReturnType<typeof adornmentsOf> {
		return adornmentsOf(resolvedChildren.toArray());
	}

	return (
		<span
			{...rest}
			class={clsx(styles.chip, local.class)}
			data-prefix={adornments().hasPrefix}
			data-suffix={adornments().hasSuffix}
		>
			{resolvedChildren()}
		</span>
	);
}
