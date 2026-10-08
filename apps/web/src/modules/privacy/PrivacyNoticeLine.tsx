import styles from "./PrivacyNoticeLine.module.scss";

/** The one-line pointer to `/privacy` shown under every public form's submit
 *  button. Opens in a new tab so a half-filled form is not lost. */
export function PrivacyNoticeLine() {
	return (
		<p class={styles.line}>
			How we handle your data:{" "}
			<a
				class={styles.link}
				href="/privacy"
				target="_blank"
				rel="noopener"
			>
				Privacy notice
			</a>
		</p>
	);
}
