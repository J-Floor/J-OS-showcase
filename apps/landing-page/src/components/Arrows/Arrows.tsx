/** Arrow glyphs copied verbatim from the live thejfloor.com. Decorative (the
 * link text names the destination), sized by the caller's class, drawn in
 * currentColor. */

/** The "Apply to join" pill arrow: a stroked 24×24 up-right arrow. */
export function PillArrow(props: { class?: string }) {
	return (
		<svg
			class={props.class}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M7 17 17 7M7 7h10v10"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	);
}

/** The footer's external-link arrow: Phosphor "ArrowUpRight" (regular). */
export function LinkArrow(props: { class?: string }) {
	return (
		<svg
			class={props.class}
			viewBox="0 0 256 256"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
		</svg>
	);
}
