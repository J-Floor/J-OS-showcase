import styles from "./RollLabel.module.scss";

/** A label that rolls up when its enclosing link or button is hovered: the
 * visible copy slides up and shrinks away while a duplicate rises into place —
 * the hover on thejfloor.com's "Contact" pill. The duplicate is a CSS
 * pseudo-element with empty alt text, so the accessible name stays the label. */
export function RollLabel(props: { label: string }) {
	return (
		<span class={styles.roll} data-label={props.label}>
			<span class={styles.text}>{props.label}</span>
		</span>
	);
}
