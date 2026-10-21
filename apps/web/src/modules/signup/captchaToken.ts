import { errAsync, ResultAsync } from "neverthrow";

import { SITE_KEY } from "../../shared/recaptcha.ts";

const CAPTCHA_FAILED = "captcha failed";

/**
 * A reCAPTCHA token for `action`, or an Err when the script never loaded, the
 * site key is missing or Google refused. The caller shows its own wording: the
 * visitor learns only that the submission did not go through.
 */
export function getCaptchaToken(action: string): ResultAsync<string, string> {
	const recaptcha = window.grecaptcha;
	if (!SITE_KEY || !recaptcha) return errAsync(CAPTCHA_FAILED);
	const execute = ResultAsync.fromThrowable(
		(siteKey: string) => recaptcha.execute(siteKey, { action }),
		() => CAPTCHA_FAILED
	);
	return execute(SITE_KEY);
}
