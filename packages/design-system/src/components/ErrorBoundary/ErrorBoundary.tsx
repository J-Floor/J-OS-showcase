import {
	createEffect,
	ErrorBoundary as SolidErrorBoundary,
	on,
	type JSX,
	type ParentProps,
} from "solid-js";

import { ErrorScreen } from "../ErrorScreen/ErrorScreen.tsx";

export type ErrorBoundaryProps = ParentProps & {
	/** Log caught errors to the console. Default `true`. */
	logError?: boolean;
	/** Called with each caught error, for side effects such as an update check. */
	onError?: (error: unknown) => void;
	/** Any value; when it changes, a caught error is cleared and the children
	 *  render again. Pass the route path so navigating away recovers. */
	resetKey?: unknown;
	/** Replaces the default `ErrorScreen`. `reset` renders the children again. */
	fallback?: (error: unknown, reset: () => void) => JSX.Element;
};

/**
 * Catches render errors in its subtree and shows a retry screen
 * (`ErrorScreen`, or the caller's `fallback`). Wraps Solid's `ErrorBoundary`.
 *
 * Ported from EmboUI's ErrorBoundary. EmboUI's `Copiable` error-message wrapper
 * is not ported — the message renders as plain text. React's `resetKeys` array
 * becomes one `resetKey` value, and its three fallback props become Solid's
 * own `(error, reset)` signature.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
	let resetCaught: (() => void) | undefined;
	createEffect(
		on(
			() => props.resetKey,
			() => {
				resetCaught?.();
			},
			{ defer: true }
		)
	);
	return (
		<SolidErrorBoundary
			fallback={(error: unknown, reset: () => void) => {
				resetCaught = () => {
					resetCaught = undefined;
					reset();
				};
				if (props.logError !== false) {
					// eslint-disable-next-line no-console -- logging is the point of an error boundary
					console.error("ErrorBoundary caught an error:", error);
				}
				props.onError?.(error);
				if (props.fallback) return props.fallback(error, resetCaught);
				return (
					<ErrorScreen
						message={
							error instanceof Error
								? error.message
								: String(error)
						}
						onRetry={resetCaught}
					/>
				);
			}}
		>
			{props.children}
		</SolidErrorBoundary>
	);
}
