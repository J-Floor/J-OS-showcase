// Shape of the relevant fields from Google's siteverify response.
export type RecaptchaResult = {
	success?: boolean;
	action?: string;
	score?: number;
};

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
		result.score >= 0.5
	);
}

// Verifies a reCAPTCHA token against Google's siteverify endpoint and checks
// it against `expectedAction`. Treats ANY siteverify failure — network reject,
// non-2xx, or non-JSON body — as a verification failure behind one generic
// message. Never leaks the score or the specific failure reason. Takes
// `secret` as a param rather than reading `process.env` itself so callers
// keep ownership of the "is reCAPTCHA configured" check.
export async function verifyRecaptchaToken(
	secret: string,
	token: string,
	expectedAction: string
): Promise<boolean> {
	let result: RecaptchaResult;
	try {
		const res = await fetch(
			"https://www.google.com/recaptcha/api/siteverify",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					secret,
					response: token,
				}).toString(),
			}
		);
		if (!res.ok) throw new Error("siteverify returned a non-2xx response");
		result = (await res.json()) as RecaptchaResult;
	} catch {
		throw new Error("Couldn't verify you're human — please try again.");
	}
	return passesRecaptcha(result, expectedAction);
}
