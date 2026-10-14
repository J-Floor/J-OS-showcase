import { onCleanup, onMount } from "solid-js";

// grecaptcha v3 is loaded by a <script> we inject on mount; type just what we call.
declare global {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- global augmentation requires interface
	interface Window {
		grecaptcha?: {
			ready(callback: () => void): void;
			execute(
				siteKey: string,
				options: { action: string }
			): Promise<string>;
		};
	}
}

export const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

/**
 * Injects the grecaptcha script on mount for the public page named by
 * `purpose` ("signup", "visitor"). Removes the script and grecaptcha's
 * floating badge on cleanup so they don't leak onto every other
 * (authenticated) page after leaving it.
 */
export function useRecaptchaScript(purpose: string) {
	onMount(() => {
		if (!SITE_KEY) {
			// eslint-disable-next-line no-console -- dev hint for a missing required env var
			console.warn(
				`VITE_RECAPTCHA_SITE_KEY is not set — ${purpose} captcha will fail`
			);
			return;
		}
		const source = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
		if (document.querySelector(`script[src="${source}"]`)) return;
		const script = document.createElement("script");
		script.src = source;
		script.async = true;
		document.head.appendChild(script);

		onCleanup(() => {
			script.remove();
			document.querySelector(".grecaptcha-badge")?.remove();
		});
	});
}
