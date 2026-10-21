export type InputError =
	| { type: "FieldTooLong" }
	| { type: "RecaptchaFailed" }
	| { type: "RecaptchaUnavailable" }
	| { type: "InvalidAssetTag" }
	| { type: "InvalidZonedValue" }
	| { type: "TooManyLinks" }
	| { type: "LinkTooLong" }
	| { type: "LinkNotHttp" }
	| { type: "FirstNameRequired" }
	| { type: "LastNameRequired" }
	| { type: "ProjectDatesOutOfOrder" };

export const inputMessages: Record<InputError["type"], string> = {
	FieldTooLong: "One of the fields is too long.",
	RecaptchaFailed: "Couldn't verify you're human. Please try again.",
	RecaptchaUnavailable:
		"We couldn't check the reCAPTCHA. Try again in a moment.",
	InvalidAssetTag:
		"Asset tag must be one uppercase letter followed by five digits (e.g. A00000).",
	InvalidZonedValue: "That is not a valid date and time.",
	TooManyLinks: "Too many links.",
	LinkTooLong: "Link is too long.",
	LinkNotHttp: "Links must use http or https.",
	FirstNameRequired: "First name is required.",
	LastNameRequired: "Last name is required.",
	ProjectDatesOutOfOrder:
		"Project start date must be on or before its end date.",
};
