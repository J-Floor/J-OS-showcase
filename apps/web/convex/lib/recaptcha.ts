import { errAsync, ResultAsync } from "neverthrow";

import type { InputError } from "./errors/input.ts";

// Shape of the relevant fields from Google's siteverify response.
export type RecaptchaResult = {
	success?: boolean;
	action?: string;
	score?: number;
};

const BOT_SCORE_THRESHOLD = 0.5;

// Pure pass/fail decision, factored out so it can be unit-tested without the
// live siteverify fetch. Accept only a successful verification for the expected
// action whose score clears the bot threshold.
export function passesRecaptcha(
	result: RecaptchaResult,
	expectedAction: string
): boolean {
	return (
		result.success === true &&
		result.action === expectedAction &&
		typeof result.score === "number" &&
		result.score >= BOT_SCORE_THRESHOLD
	);
}

// Verifies a reCAPTCHA token against Google's siteverify endpoint and checks
// it against `expectedAction`. Treats ANY siteverify failure — network reject,
// non-2xx, or non-JSON body — as `RecaptchaUnavailable`, so an outage is not
// reported to the applicant as a failed check. Ok(false) is a real rejection.
// Never leaks the score or the failure reason. Takes
// `secret` as a param rather than reading `process.env` itself so callers
// keep ownership of the "is reCAPTCHA configured" check.
export function verifyRecaptchaToken(
	secret: string,
	token: string,
	expectedAction: string
): ResultAsync<boolean, InputError> {
	return ResultAsync.fromPromise(
		fetch("https://www.google.com/recaptcha/api/siteverify", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				secret,
				response: token,
			}).toString(),
		}),
		unavailable
	)
		.andThen((response) =>
			response.ok
				? ResultAsync.fromPromise(
						response.json() as Promise<RecaptchaResult>,
						unavailable
					)
				: errAsync(unavailable())
		)
		.map((result) => passesRecaptcha(result, expectedAction));
}

function unavailable(): InputError {
	return { type: "RecaptchaUnavailable" };
}
