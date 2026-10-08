import {
	ErrorBoundary as SolidErrorBoundary,
	type JSX,
	type ParentProps,
} from "solid-js";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { ExceptionDisplay } from "../ExceptionDisplay/ExceptionDisplay.tsx";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./ErrorBoundary.module.scss";

export type ErrorBoundaryProps = ParentProps & {
	/** Log caught errors to the console. Default `true`. */
	logError?: boolean;
	/** Called with each caught error, for side effects such as an update check. */
	onError?: (error: unknown) => void;
};

/**
 * Catches render errors in its subtree and shows a retry screen
 * (`ExceptionDisplay`). Wraps Solid's `ErrorBoundary`.
 *
 * Ported from EmboUI's ErrorBoundary. EmboUI's `Copiable` error-message wrapper
 * is not ported — the message renders as plain text.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
	return (
		<SolidErrorBoundary
			fallback={(error: unknown, reset: () => void) => {
				if (props.logError !== false) {
					// eslint-disable-next-line no-console -- logging is the point of an error boundary
					console.error("ErrorBoundary caught an error:", error);
				}
				props.onError?.(error);
				return (
					<div class={styles.fullHeight}>
						<ExceptionDisplay
							status="error"
							icon="bolt"
							title="Something went wrong."
							description={
								error instanceof Error
									? error.message
									: String(error)
							}
						>
							<Button
								variant="tertiary"
								onClick={() => {
									window.history.back();
								}}
							>
								<Icon>{ICONS.back}</Icon>Go back
							</Button>
							<Button onClick={reset}>
								<Icon>{ICONS.refresh}</Icon>Retry
							</Button>
						</ExceptionDisplay>
					</div>
				);
			}}
		>
			{props.children}
		</SolidErrorBoundary>
	);
}
