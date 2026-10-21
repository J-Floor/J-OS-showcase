import {
	ErrorBoundary as SolidErrorBoundary,
	type JSX,
	type ParentProps,
} from "solid-js";

import { ErrorScreen } from "../ErrorScreen/ErrorScreen.tsx";

export type ErrorBoundaryProps = ParentProps & {
	/** Log caught errors to the console. Default `true`. */
	logError?: boolean;
	/** Called with each caught error, for side effects such as an update check. */
	onError?: (error: unknown) => void;
};

/**
 * Catches render errors in its subtree and shows a retry screen
 * (`ErrorScreen`). Wraps Solid's `ErrorBoundary`.
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
					<ErrorScreen
						message={
							error instanceof Error
								? error.message
								: String(error)
						}
						onRetry={reset}
					/>
				);
			}}
		>
			{props.children}
		</SolidErrorBoundary>
	);
}
