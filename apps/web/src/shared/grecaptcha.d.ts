export {};

// grecaptcha v3 is loaded by a <script> that recaptcha.ts injects on mount;
// type just what we call.
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
