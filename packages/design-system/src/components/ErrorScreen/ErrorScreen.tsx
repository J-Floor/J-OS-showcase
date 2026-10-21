import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { ExceptionDisplay } from "../ExceptionDisplay/ExceptionDisplay.tsx";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./ErrorScreen.module.scss";

export type ErrorScreenProps = {
	/** What failed, shown under the "Something went wrong." heading. */
	message: string;
	/** Runs when the person presses Retry. */
	onRetry: () => void;
};

/**
 * Full-height "Something went wrong." screen with Go back (browser history)
 * and Retry, built on {@link ExceptionDisplay}. Shown where a whole page or
 * subtree failed to render or load.
 */
export function ErrorScreen(props: ErrorScreenProps): JSX.Element {
	return (
		<div class={styles.screen}>
			<ExceptionDisplay
				status="error"
				icon="bolt"
				title="Something went wrong."
				description={props.message}
			>
				<Button
					variant="tertiary"
					onClick={() => {
						window.history.back();
					}}
				>
					<Icon>{ICONS.back}</Icon>Go back
				</Button>
				<Button
					onClick={() => {
						props.onRetry();
					}}
				>
					<Icon>{ICONS.refresh}</Icon>Retry
				</Button>
			</ExceptionDisplay>
		</div>
	);
}
