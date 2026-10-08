import type { JSX } from "solid-js";

import styles from "./Icon.module.scss";

export type IconProps = {
	/** Material Symbols ligature name, e.g. "check", "warning". */
	children: string;
	/** Render the filled variant. */
	fill?: boolean;
	class?: string;
};

/**
 * Material Symbols glyph. Carries `data-icon` so a typography mixin applied to
 * an ancestor sizes the glyph via its `[data-icon] { font-size }` rule WITHOUT
 * touching the icon's own `font-family` (which would break the ligature). Size
 * icons through SCSS — a `jf-typo-*` mixin on a container, or `[data-icon] {
 * font-size }` in the component's stylesheet — never with inline styles.
 *
 * Ported from EmboUI's Icon. React→Solid: no `forwardRef`; J-OS ships a single
 * icon font (Material Symbols Sharp), so embo's `data-font` font switching is
 * dropped and the family lives on `.icon`.
 */
export function Icon(props: IconProps): JSX.Element {
	return (
		<span
			data-icon=""
			class={props.class ? `${styles.icon} ${props.class}` : styles.icon}
			data-fill={props.fill ? "" : undefined}
			aria-hidden="true"
		>
			{props.children}
		</span>
	);
}
